// src/components/markdown/MemoizedMarkdown.tsx
import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Configure marked
marked.setOptions({
    gfm: true,
    breaks: false,
});

/**
 * Parse markdown content into discrete blocks using marked's lexer.
 */
function parseMarkdownIntoBlocks(markdown: string): string[] {
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');
    const tokens = marked.lexer(normalizedMarkdown);
    return tokens.map(token => token.raw);
}

/**
 * A memoized component that renders a single markdown block.
 */
const MemoizedMarkdownBlock = memo(
    ({ content }: { content: string }) => {
        return (
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // --- Add wrapper for table ---
                    table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-4"> {/* Added wrapper with horizontal scroll */}
                            <table {...props} />
                        </div>
                    ),
                    // --- End wrapper for table ---

                    // Keep existing styling components
                    p: (props) => <p className="mb-4" {...props} />,
                    h1: (props) => <h1 className="text-xl font-bold mt-6 mb-4" {...props} />,
                    h2: (props) => <h2 className="text-lg font-bold mt-5 mb-3" {...props} />,
                    h3: (props) => <h3 className="text-base font-bold mt-4 mb-2" {...props} />,
                    ul: (props) => <ul className="list-disc pl-5 mb-4" {...props} />,
                    ol: (props) => <ol className="list-decimal pl-5 mb-4" {...props} />,
                    li: (props) => <li className="mb-1" {...props} />,
                    pre: (props) => <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded my-4 overflow-auto" {...props} />,
                    code: (props) => {
                        const { inline, className, children, ...rest } = props as any;
                        // Note: If using syntax highlighting, this might need adjustment.
                        // This basic version handles block vs inline.
                        return !inline ? (
                            <code className={className} {...rest}>
                                {children}
                            </code>
                        ) : (
                            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm" {...rest}>
                                {children}
                            </code>
                        );
                    },
                    blockquote: (props) => <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4" {...props} />,
                }}
            >
                {content}
            </ReactMarkdown>
        );
    },
    (prevProps, nextProps) => prevProps.content === nextProps.content,
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

/**
 * A memoized component that splits markdown into blocks and only updates
 * blocks that have actually changed.
 */
export const MemoizedMarkdown = memo(
    ({ content, id }: { content: string; id: string }) => {
        const blocks = useMemo(() =>
            parseMarkdownIntoBlocks(content),
            [content]
        );

        return (
            // Added the prose class here to scope the table styles from styles.css
            <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
                {blocks.map((block, index) => (
                    <MemoizedMarkdownBlock
                        content={block}
                        // biome-ignore lint/suspicious/noArrayIndexKey: Okay for this specific block rendering
                        key={`${id}-block_${index}`}
                    />
                ))}
            </div>
        );
    },
    (prevProps, nextProps) => prevProps.content === nextProps.content && prevProps.id === nextProps.id
);

MemoizedMarkdown.displayName = 'MemoizedMarkdown';