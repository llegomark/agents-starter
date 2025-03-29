// src/app.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import type { Message } from "@ai-sdk/react";
import { APPROVAL } from "./shared";
import type { tools } from "./tools";

// Component imports
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Input } from "@/components/input/Input";
import { Avatar } from "@/components/avatar/Avatar";
import { Toggle } from "@/components/toggle/Toggle";
import { Tooltip } from "@/components/tooltip/Tooltip";
import { MemoizedMarkdown } from "./components/markdown/MemoizedMarkdown";

// Icon imports
import {
  Bug,
  LinkSimple,
  Moon,
  PaperPlaneRight,
  Robot,
  Sun,
  Trash,
  DownloadSimple,
} from "@phosphor-icons/react";

// List of tools that require human confirmation
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "getWeatherInformation",
];

// Define a type for the source structure we expect in annotations
type GoogleSource = {
  sourceType: "url";
  id: string;
  url: string;
  title?: string;
  providerMetadata?: any;
};

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  const [showDebug, setShowDebug] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  const agent = useAgent({
    agent: "chat",
  });

  const {
    messages: agentMessages,
    input: agentInput,
    handleInputChange: handleAgentInputChange,
    handleSubmit: handleAgentSubmit,
    addToolResult,
    clearHistory,
  } = useAgentChat({
    agent,
    maxSteps: 5,
    experimental_throttle: 50,
  });

  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  const pendingToolCallConfirmation = agentMessages.some((m: Message) =>
    m.parts?.some(
      (part) =>
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "call" &&
        toolsRequiringConfirmation.includes(
          part.toolInvocation.toolName as keyof typeof tools
        )
    )
  );

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const exportConversationToMarkdown = () => {
    if (agentMessages.length === 0) {
      // No messages to export
      return;
    }

    // Format the conversation as markdown
    let markdownContent = "# AI Chat Conversation\n\n";
    markdownContent += `*Exported on ${new Date().toLocaleString()}*\n\n`;

    agentMessages.forEach((message) => {
      const role = message.role === "user" ? "👤 User" : "🤖 Assistant";
      const timestamp = formatTime(new Date(message.createdAt as unknown as string));

      markdownContent += `## ${role} (${timestamp})\n\n`;

      if (message.parts && message.parts.length > 0) {
        message.parts.forEach(part => {
          if (part.type === "text") {
            markdownContent += part.text + "\n\n";
          } else if (part.type === "tool-invocation") {
            const tool = part.toolInvocation;
            markdownContent += `**Tool Call**: ${tool.toolName}\n`;
            markdownContent += "```json\n";
            markdownContent += JSON.stringify(tool.args, null, 2);
            markdownContent += "\n```\n\n";

            if (tool.state === "result") {
              markdownContent += `**Result**:\n`;
              markdownContent += "```\n";
              markdownContent += typeof tool.result === 'object'
                ? JSON.stringify(tool.result, null, 2)
                : tool.result;
              markdownContent += "\n```\n\n";
            }
          }
        });
      }

      // Add source annotations if present
      const sourcesAnnotation = message.annotations?.find(
        (anno) => anno && typeof anno === 'object' && 'googleSources' in anno
      );

      const sources = sourcesAnnotation ? (sourcesAnnotation as any).googleSources : undefined;

      if (sources && sources.length > 0) {
        markdownContent += "**Sources:**\n\n";
        sources.forEach((source: { url: string; title?: string }) => {
          const title = source.title || new URL(source.url).hostname;
          markdownContent += `- [${title}](${source.url})\n`;
        });
        markdownContent += "\n";
      }

      markdownContent += "---\n\n";
    });

    // Create and download the file
    const blob = new Blob([markdownContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-chat-conversation-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-[100vh] w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
        {/* Header with uniform button spacing */}
        <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 flex items-center gap-3 sticky top-0 z-10 bg-white dark:bg-neutral-950">
          <div className="flex items-center justify-center h-8 w-8">
            <svg
              width="28px"
              height="28px"
              className="text-(--color-orange-500)"
              data-icon="agents"
            >
              <title>Cloudflare Agents</title>
              <symbol id="ai:local:agents" viewBox="0 0 80 79">
                <path
                  fill="currentColor"
                  d="M69.3 39.7c-3.1 0-5.8 2.1-6.7 5H48.3V34h4.6l4.5-2.5c1.1.8 2.5 1.2 3.9 1.2 3.8 0 7-3.1 7-7s-3.1-7-7-7-7 3.1-7 7c0 .9.2 1.8.5 2.6L51.9 30h-3.5V18.8h-.1c-1.3-1-2.9-1.6-4.5-1.9h-.2c-1.9-.3-3.9-.1-5.8.6-.4.1-.8.3-1.2.5h-.1c-.1.1-.2.1-.3.2-1.7 1-3 2.4-4 4 0 .1-.1.2-.1.2l-.3.6c0 .1-.1.1-.1.2v.1h-.6c-2.9 0-5.7 1.2-7.7 3.2-2.1 2-3.2 4.8-3.2 7.7 0 .7.1 1.4.2 2.1-1.3.9-2.4 2.1-3.2 3.5s-1.2 2.9-1.4 4.5c-.1 1.6.1 3.2.7 4.7s1.5 2.9 2.6 4c-.8 1.8-1.2 3.7-1.1 5.6 0 1.9.5 3.8 1.4 5.6s2.1 3.2 3.6 4.4c1.3 1 2.7 1.7 4.3 2.2v-.1q2.25.75 4.8.6h.1c0 .1.1.1.1.1.9 1.7 2.3 3 4 4 .1.1.2.1.3.2h.1c.4.2.8.4 1.2.5 1.4.6 3 .8 4.5.7.4 0 .8-.1 1.3-.1h.1c1.6-.3 3.1-.9 4.5-1.9V62.9h3.5l3.1 1.7c-.3.8-.5 1.7-.5 2.6 0 3.8 3.1 7 7 7s7-3.1 7-7-3.1-7-7-7c-1.5 0-2.8.5-3.9 1.2l-4.6-2.5h-4.6V48.7h14.3c.9 2.9 3.5 5 6.7 5 3.8 0 7-3.1 7-7s-3.1-7-7-7m-7.9-16.9c1.6 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.4-3 3-3m0 41.4c1.6 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.4-3 3-3M44.3 72c-.4.2-.7.3-1.1.3-.2 0-.4.1-.5.1h-.2c-.9.1-1.7 0-2.6-.3-1-.3-1.9-.9-2.7-1.7-.7-.8-1.3-1.7-1.6-2.7l-.3-1.5v-.7q0-.75.3-1.5c.1-.2.1-.4.2-.7s.3-.6.5-.9c0-.1.1-.1.1-.2.1-.1.1-.2.2-.3s.1-.2.2-.3c0 0 0-.1.1-.1l.6-.6-2.7-3.5c-1.3 1.1-2.3 2.4-2.9 3.9-.2.4-.4.9-.5 1.3v.1c-.1.2-.1.4-.1.6-.3 1.1-.4 2.3-.3 3.4-.3 0-.7 0-1-.1-2.2-.4-4.2-1.5-5.5-3.2-1.4-1.7-2-3.9-1.8-6.1q.15-1.2.6-2.4l.3-.6c.1-.2.2-.4.3-.5 0 0 0-.1.1-.1.4-.7.9-1.3 1.5-1.9 1.6-1.5 3.8-2.3 6-2.3q1.05 0 2.1.3v-4.5c-.7-.1-1.4-.2-2.1-.2-1.8 0-3.5.4-5.2 1.1-.7.3-1.3.6-1.9 1s-1.1.8-1.7 1.3c-.3.2-.5.5-.8.8-.6-.8-1-1.6-1.3-2.6-.2-1-.2-2 0-2.9.2-1 .6-1.9 1.3-2.6.6-.8 1.4-1.4 2.3-1.8l1.8-.9-.7-1.9c-.4-1-.5-2.1-.4-3.1s.5-2.1 1.1-2.9q.9-1.35 2.4-2.1c.9-.5 2-.8 3-.7.5 0 1 .1 1.5.2 1 .2 1.8.7 2.6 1.3s1.4 1.4 1.8 2.3l4.1-1.5c-.9-2-2.3-3.7-4.2-4.9q-.6-.3-.9-.6c.4-.7 1-1.4 1.6-1.9.8-.7 1.8-1.1 2.9-1.3.9-.2 1.7-.1 2.6 0 .4.1.7.2 1.1.3V72zm25-22.3c-1.6 0-3-1.3-3-3 0-1.6 1.3-3 3-3s3 1.3 3 3c0 1.6-1.3 3-3 3"
                />
              </symbol>
              <use href="#ai:local:agents" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-base">Chat</h2>
          </div>
          {/* Header controls with uniform spacing */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9 flex items-center justify-center"
              onClick={() => setShowDebug((prev) => !prev)}
            >
              <Bug size={16} />
            </Button>
            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9 flex items-center justify-center"
              onClick={exportConversationToMarkdown}
              disabled={agentMessages.length === 0}
            >
              <DownloadSimple size={20} />
            </Button>
            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9 flex items-center justify-center"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </Button>
            <Button
              variant="ghost"
              size="md"
              shape="square"
              className="rounded-full h-9 w-9 flex items-center justify-center"
              onClick={clearHistory}
            >
              <Trash size={20} />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)]">
          {agentMessages.length === 0 && (
            <div className="h-full flex items-start justify-center pt-6 md:pt-8">
              <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900 shadow-sm">
                <div className="text-center space-y-4 pt-2">
                  <div className="bg-(--color-orange-500)/10 text-(--color-orange-500) rounded-full p-3 inline-flex mx-auto">
                    <Robot size={24} weight="duotone" />
                  </div>
                  <h3 className="font-semibold text-lg">Welcome to AI Chat</h3>
                  <p className="text-muted-foreground text-sm">
                    Start a conversation with your AI assistant. Try asking about:
                  </p>

                  <div className="grid grid-cols-1 gap-3 text-sm text-left">
                    <div className="bg-white/50 dark:bg-neutral-800/50 p-3 rounded-lg hover:bg-white/80 dark:hover:bg-neutral-800/80 transition-colors">
                      <div className="flex items-center gap-2 font-medium mb-1 text-(--color-orange-500)">
                        <span className="bg-(--color-orange-500)/10 p-1 rounded">🔍</span>
                        <span>Latest News & Information</span>
                      </div>
                      <p className="pl-7 text-xs text-muted-foreground">
                        "What's the latest news about AI?" or "Tell me about recent scientific discoveries"
                      </p>
                    </div>

                    <div className="bg-white/50 dark:bg-neutral-800/50 p-3 rounded-lg hover:bg-white/80 dark:hover:bg-neutral-800/80 transition-colors">
                      <div className="flex items-center gap-2 font-medium mb-1 text-(--color-orange-500)">
                        <span className="bg-(--color-orange-500)/10 p-1 rounded">🌦️</span>
                        <span>Weather & Local Information</span>
                      </div>
                      <p className="pl-7 text-xs text-muted-foreground">
                        "What's the weather like in Tokyo?" or "What time is it in London right now?"
                      </p>
                    </div>

                    <div className="bg-white/50 dark:bg-neutral-800/50 p-3 rounded-lg hover:bg-white/80 dark:hover:bg-neutral-800/80 transition-colors">
                      <div className="flex items-center gap-2 font-medium mb-1 text-(--color-orange-500)">
                        <span className="bg-(--color-orange-500)/10 p-1 rounded">💡</span>
                        <span>Helpful Explanations</span>
                      </div>
                      <p className="pl-7 text-xs text-muted-foreground">
                        "Explain quantum computing" or "How do vaccines work?"
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-4 italic">
                    Type your message below to get started
                  </p>
                </div>
              </Card>
            </div>
          )}

          {agentMessages.map((m: Message, index) => {
            const isUser = m.role === "user";
            const showAvatar =
              index === 0 || agentMessages[index - 1]?.role !== m.role;

            const sourcesAnnotation = m.annotations?.find(
              (anno) => anno && typeof anno === 'object' && 'googleSources' in anno
            );
            const sources: GoogleSource[] | undefined = sourcesAnnotation ? (sourcesAnnotation as any).googleSources : undefined;

            return (
              <div key={m.id}>
                {showDebug && (
                  <pre className="text-xs text-muted-foreground overflow-scroll">
                    {JSON.stringify(m, null, 2)}
                  </pre>
                )}
                <div
                  className={`flex ${isUser ? "justify-end" : "justify-start"
                    }`}
                >
                  <div
                    className={`flex gap-2 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"
                      }`}
                  >
                    {/* Avatar */}
                    {showAvatar && !isUser ? (
                      <Avatar username={"AI"} className="flex-shrink-0" />
                    ) : (
                      !isUser && <div className="w-8 flex-shrink-0" />
                    )}

                    {/* Content and Timestamp Container */}
                    <div className="flex flex-col min-w-0">
                      {/* Main Content Bubble */}
                      {m.parts && m.parts.length > 0 && (
                        <Card
                          className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${isUser
                            ? "rounded-br-none"
                            : "rounded-bl-none border-assistant-border"
                            } relative`}
                        >
                          {m.parts.map((part, i) => {
                            // Only render non-source parts in the main bubble
                            if (part.type === "source") return null;

                            if (part.type === "text") {
                              return (
                                <div key={i}>
                                  {part.text.startsWith(
                                    "scheduled message"
                                  ) && (
                                      <span className="absolute -top-3 -left-2 text-base">
                                        🕒
                                      </span>
                                    )}
                                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none overflow-hidden">
                                    <MemoizedMarkdown
                                      id={m.id}
                                      content={part.text.replace(
                                        /^scheduled message: /,
                                        ""
                                      )}
                                    />
                                  </div>
                                </div>
                              );
                            }

                            if (part.type === "tool-invocation") {
                              // Tool invocation rendering logic
                              const toolInvocation = part.toolInvocation;
                              const toolCallId = toolInvocation.toolCallId;

                              if (
                                toolsRequiringConfirmation.includes(
                                  toolInvocation.toolName as keyof typeof tools
                                ) &&
                                toolInvocation.state === "call"
                              ) {
                                return (
                                  <Card
                                    key={i}
                                    className="p-4 my-3 rounded-md bg-neutral-100 dark:bg-neutral-900"
                                  >
                                    <div className="flex items-center gap-2 mb-3">
                                      <div className="bg-(--color-orange-500)/10 p-1.5 rounded-full">
                                        <Robot
                                          size={16}
                                          className="text-(--color-orange-500)"
                                        />
                                      </div>
                                      <h4 className="font-medium">
                                        {toolInvocation.toolName}
                                      </h4>
                                    </div>

                                    <div className="mb-3">
                                      <h5 className="text-xs font-medium mb-1 text-muted-foreground">
                                        Arguments:
                                      </h5>
                                      <pre className="bg-background/80 p-2 rounded-md text-xs overflow-auto">
                                        {JSON.stringify(
                                          toolInvocation.args,
                                          null,
                                          2
                                        )}
                                      </pre>
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() =>
                                          addToolResult({
                                            toolCallId,
                                            result: APPROVAL.NO,
                                          })
                                        }
                                      >
                                        Reject
                                      </Button>
                                      <Tooltip content={"Accept action"}>
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          onClick={() =>
                                            addToolResult({
                                              toolCallId,
                                              result: APPROVAL.YES,
                                            })
                                          }
                                        >
                                          Approve
                                        </Button>
                                      </Tooltip>
                                    </div>
                                  </Card>
                                );
                              }
                              return null; // Handle other tool states if needed
                            }
                            return null; // Handle other part types if necessary
                          })}
                        </Card>
                      )}

                      {/* Timestamp */}
                      <p
                        className={`text-xs text-muted-foreground mt-1 ${isUser ? "text-right" : "text-left"
                          } ${sources && sources.length > 0 ? "mb-1" : ""}`}
                      >
                        {formatTime(
                          new Date(m.createdAt as unknown as string)
                        )}
                      </p>

                      {/* Source Rendering from Annotations */}
                      {sources && sources.length > 0 && (
                        <div
                          className={`flex flex-wrap gap-2 mt-1 ${isUser ? "justify-end" : "justify-start"
                            }`}
                        >
                          {sources.map((source, i) => (
                            <a
                              key={`source-${m.id}-${i}`}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-neutral-150 dark:bg-neutral-800 px-2 py-1 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1 text-neutral-600 dark:text-neutral-400"
                            >
                              <LinkSimple size={12} />
                              <span>
                                {source.title ||
                                  new URL(source.url).hostname}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form
          onSubmit={(e) =>
            handleAgentSubmit(e, {
              data: {
                annotations: {
                  hello: "world",
                },
              },
            })
          }
          className="p-3 bg-white dark:bg-neutral-950 absolute bottom-0 left-0 right-0 z-10 border-t border-neutral-300 dark:border-neutral-800"
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                disabled={pendingToolCallConfirmation}
                placeholder={
                  pendingToolCallConfirmation
                    ? "Please respond to the tool confirmation above..."
                    : "Type your message..."
                }
                className="pl-4 pr-10 py-2 w-full rounded-full"
                value={agentInput}
                onChange={handleAgentInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAgentSubmit(e as unknown as React.FormEvent);
                  }
                }}
                onValueChange={undefined}
              />
            </div>

            <Button
              type="submit"
              shape="square"
              className="rounded-full h-10 w-10 flex-shrink-0 flex items-center justify-center"
              disabled={pendingToolCallConfirmation || !agentInput.trim()}
            >
              <PaperPlaneRight size={16} />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}