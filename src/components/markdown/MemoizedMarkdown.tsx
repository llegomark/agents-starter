import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * Parse markdown content into discrete blocks
 * This allows for more efficient re-rendering when streaming content
 * 
 * Note: We preserve empty lines between paragraphs by marking them as special tokens
 */
function parseMarkdownIntoBlocks(markdown: string): string[] {
    // Ensure consistent line endings
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');

    // Use marked lexer to parse markdown into tokens
    const tokens = marked.lexer(normalizedMarkdown);

    // Extract raw tokens, ensuring paragraph spacing is preserved
    return tokens.map(token => {
        // Add extra newlines for paragraph tokens to ensure proper spacing
        if (token.type === 'paragraph') {
            return token.raw + '\n\n';
        }
        return token.raw;
    });
}

/**
 * A memoized component that renders a single markdown block
 * Only re-renders when content actually changes
 */
const MemoizedMarkdownBlock = memo(
    ({ content }: { content: string }) => {
        return (
            <ReactMarkdown
                // Use components in a simpler way that won't cause TypeScript errors
                components={{
                    // Ensure paragraphs have proper spacing
                    p: (props) => <p className="mb-4" {...props} />,
                    // Style headings properly
                    h1: (props) => <h1 className="text-xl font-bold mt-6 mb-4" {...props} />,
                    h2: (props) => <h2 className="text-lg font-bold mt-5 mb-3" {...props} />,
                    h3: (props) => <h3 className="text-base font-bold mt-4 mb-2" {...props} />,
                    // Style lists properly
                    ul: (props) => <ul className="list-disc pl-5 mb-4" {...props} />,
                    ol: (props) => <ol className="list-decimal pl-5 mb-4" {...props} />,
                    li: (props) => <li className="mb-1" {...props} />,
                    // Style code blocks properly
                    pre: (props) => <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded my-4 overflow-auto" {...props} />,
                    // Simple code component approach that works with TypeScript
                    code: (props) => {
                        const { inline, className, children, ...rest } = props as any;
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline ? (
                            <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded my-4 overflow-auto">
                                <code className={className} {...rest}>
                                    {children}
                                </code>
                            </pre>
                        ) : (
                            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm" {...rest}>
                                {children}
                            </code>
                        );
                    },
                    // Style blockquotes
                    blockquote: (props) => <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4" {...props} />,
                }}
            >
                {content}
            </ReactMarkdown>
        );
    },
    (prevProps, nextProps) => {
        // Return true if props are equal (to prevent re-render)
        // Return false if props are different (to trigger re-render)
        return prevProps.content === nextProps.content;
    },
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

/**
 * A memoized component that splits markdown into blocks and only updates
 * blocks that have actually changed, significantly improving performance
 * for streaming responses in long conversations.
 */
export const MemoizedMarkdown = memo(
    ({ content, id }: { content: string; id: string }) => {
        // Ensure content has proper paragraph spacing for markdown
        const formattedContent = useMemo(() => {
            // Ensure double line breaks between paragraphs if not already present
            return content.replace(/(?<!\n)\n(?!\n)/g, '\n\n');
        }, [content]);

        // Parse markdown into blocks only when content changes
        const blocks = useMemo(() =>
            parseMarkdownIntoBlocks(formattedContent),
            [formattedContent]
        );

        return (
            <div className="markdown-content">
                {blocks.map((block, index) => (
                    <MemoizedMarkdownBlock
                        content={block}
                        key={`${id}-block_${index}`}
                    />
                ))}
            </div>
        );
    },
);

MemoizedMarkdown.displayName = 'MemoizedMarkdown';