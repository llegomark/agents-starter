import { routeAgentRequest, type Schedule } from "agents";
import { unstable_getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
} from "ai";
import { google, type GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import { AsyncLocalStorage } from "node:async_hooks";
// import { env } from "cloudflare:workers";

// Configure the model with safety settings and search grounding
const model = google("gemini-2.0-flash", {
  useSearchGrounding: true,
  safetySettings: [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  ]
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
        execute: async (dataStream) => {
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
            system: `You are a helpful assistant that can do various tasks... 

${unstable_getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.

If your response is based on search results, please include the sources at the end of your response.
`,
            messages: processedMessages,
            tools,
            onFinish: (finishResult) => {
              // Extract sources from providerMetadata if available
              if (finishResult.providerMetadata?.google) {
                // Use the approach from the documentation - cast properly with unknown intermediate step
                const metadata = finishResult.providerMetadata?.google as unknown as
                  GoogleGenerativeAIProviderMetadata | undefined;

                // Safely access properties using optional chaining
                const groundingMetadata = metadata?.groundingMetadata;
                const safetyRatings = metadata?.safetyRatings;

                if (groundingMetadata) {
                  console.log("Grounding metadata found:", groundingMetadata);

                  // Log search queries if they exist
                  if (groundingMetadata.webSearchQueries) {
                    console.log("Search queries used:", groundingMetadata.webSearchQueries);
                  }

                  // If there are sources in the result
                  if (finishResult.sources && finishResult.sources.length > 0) {
                    console.log("Sources found:", finishResult.sources);
                    // Optionally, you could send this information back to the client
                    // dataStream.append({ sources: finishResult.sources });
                  }
                }

                if (safetyRatings) {
                  console.log("Safety ratings:", safetyRatings);
                }
              }

              // Call the original onFinish callback with the correct typing
              onFinish(finishResult as any); // Using 'any' to bypass the type mismatch for now
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
      return new Response("GOOGLE_GENERATIVE_AI_API_KEY is not set", { status: 500 });
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;