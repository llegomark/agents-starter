// src/server.ts
import { routeAgentRequest, type Schedule } from "agents";
import { unstable_getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  type DataStreamWriter, // Import DataStreamWriter
} from "ai";
import {
  google,
  type GoogleGenerativeAIProviderMetadata,
} from "@ai-sdk/google";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { AsyncLocalStorage } from "node:async_hooks";
// import { env } from "cloudflare:workers";

// Configure the model with safety settings and search grounding
const model = google("gemini-2.5-pro-exp-03-25", { // Model name kept as requested
  useSearchGrounding: true,
  dynamicRetrievalConfig: {
    mode: "MODE_DYNAMIC",
    dynamicThreshold: 0.0, // Lower threshold to encourage more search usage
  },
  safetySettings: [
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_NONE",
    },
  ],
});

// we use ALS to expose the agent context to the tools
export const agentContext = new AsyncLocalStorage<Chat>();

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */

  // biome-ignore lint/complexity/noBannedTypes: <explanation>
  async onChatMessage(onFinish: StreamTextOnFinishCallback<{}>) {
    // Create a streaming response that handles both text and tool outputs
    return agentContext.run(this, async () => {
      const dataStreamResponse = createDataStreamResponse({
        execute: async (dataStream: DataStreamWriter) => { // Added type annotation
          // Process any pending tool calls from previous messages
          // This handles human-in-the-loop confirmations for tools
          const processedMessages = await processToolCalls({
            messages: this.messages,
            dataStream,
            tools,
            executions,
          });

          // Stream the AI response using Gemini
          const result = streamText({
            model,
            temperature: 1,
            topP: 0.95,
            topK: 64,
            maxTokens: 65536,
            system: `You are a helpful assistant that ALWAYS responds in well-formatted Markdown, proactively using Google Search to provide accurate, up-to-date information.

            ## Markdown Formatting Requirements:
            - Use heading levels appropriately (# for main titles, ## for sections, ### for subsections)
            - Format all lists as proper Markdown bulleted (- item) or numbered (1. item) lists
            - Present code with syntax highlighting using triple backticks with language specification: \`\`\`javascript
            - Use **bold** for emphasis and *italic* for definitions or specialized terms
            - Create tables with proper Markdown syntax when presenting comparative or tabular data
            - Format hyperlinks as [Link text](URL) and never use bare URLs
            - Use blockquotes (> text) for quotations or highlighted information
            - Use horizontal rules (---) to separate major sections when appropriate
            
            ## Information Retrieval:
            - ALWAYS leverage Google Search to provide the most current information
            - For factual questions, technical topics, current events, or data-based requests - proactively search
            - Synthesize information from multiple sources when available
            - Verify facts against multiple reliable sources when possible
            
            ## Response Structure:
            - Begin responses with a direct answer to the user's question when applicable
            - Organize information in a logical hierarchy using appropriate headings
            - For complex topics, provide an "Overview" section before diving into details
            - When appropriate, include a "Summary" or "Conclusion" section at the end
            - For instructional content, use numbered lists for sequential steps
            - For most other lists, use bulleted lists for clarity
            
            ## Tone and Interaction Style:
            - Maintain a helpful, informative, and professional tone
            - Be concise while providing comprehensive information
            - Use plain language to explain complex concepts
            - Adapt your level of technicality based on the user's apparent expertise
            
            ${unstable_getSchedulePrompt({ date: new Date() })}
            
            If the user asks to schedule a task, use the schedule tool to schedule the task.
            `,
            messages: processedMessages,
            tools,
            onFinish: (finishResult) => {
              // --- START: Source Annotation ---
              // Check if sources exist in the final result
              if (finishResult.sources && finishResult.sources.length > 0) {
                console.log("Sources found, sending as annotation:", finishResult.sources);
                // Send the sources as a message annotation. This associates
                // the sources with the specific message being finished.
                dataStream.writeMessageAnnotation({
                  // Use a specific key, e.g., 'googleSources'
                  googleSources: finishResult.sources,
                });
              } else {
                console.log("No sources found in finishResult.");
              }
              // --- END: Source Annotation ---

              // --- Optional: Log other metadata (kept as before) ---
              if (finishResult.providerMetadata?.google) {
                const metadata =
                  finishResult.providerMetadata
                    ?.google as unknown as
                  | GoogleGenerativeAIProviderMetadata
                  | undefined;
                const groundingMetadata = metadata?.groundingMetadata;
                const safetyRatings = metadata?.safetyRatings;
                if (groundingMetadata) {
                  console.log("Grounding metadata found:", groundingMetadata);
                  if (groundingMetadata.webSearchQueries) {
                    console.log(
                      "Search queries used:",
                      groundingMetadata.webSearchQueries
                    );
                  }
                }
                if (safetyRatings) {
                  console.log("Safety ratings:", safetyRatings);
                }
              }
              // --- End Optional Logging ---

              // Call the original onFinish callback
              onFinish(finishResult as any);
            },
            onError: (error) => {
              console.error("Error while streaming:", error);
            },
            maxSteps: 10,
          });

          // Merge the AI response stream with tool execution outputs
          result.mergeIntoDataStream(dataStream);
        },
      });

      return dataStreamResponse;
    });
  }

  async executeTask(description: string, task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date(),
      },
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error(
        "GOOGLE_GENERATIVE_AI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
      return new Response("GOOGLE_GENERATIVE_AI_API_KEY is not set", {
        status: 500,
      });
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;