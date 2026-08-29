import React from 'react'
import Markdown from 'react-native-markdown-display'
import { verticalScale } from '@/utils/styling'

type Props = {
  content: string
  /** Text color for the surrounding bubble — assistant bubbles are light text on dark. */
  tone?: 'light' | 'dark'
}

/**
 * Renders Fynn's replies as formatted markdown (bold, lists, tables, headings,
 * inline code) instead of a flat text block, so numbers, breakdowns, and
 * step-by-step answers actually read the way the model intended them to.
 */
export default function ChatMarkdown({ content, tone = 'light' }: Props) {
  const textColor = tone === 'light' ? '#f5f5f5' : '#171717'
  const borderColor = tone === 'light' ? '#404040' : '#d4d4d4'

  return (
    <Markdown
      style={{
        body: { color: textColor, fontSize: verticalScale(15) },
        paragraph: { marginTop: 0, marginBottom: 6 },
        heading1: { color: textColor, fontSize: verticalScale(18), fontWeight: '700', marginBottom: 6 },
        heading2: { color: textColor, fontSize: verticalScale(16), fontWeight: '700', marginBottom: 6 },
        heading3: { color: textColor, fontSize: verticalScale(15), fontWeight: '700', marginBottom: 4 },
        strong: { fontWeight: '700', color: textColor },
        em: { fontStyle: 'italic' },
        bullet_list: { marginBottom: 4 },
        ordered_list: { marginBottom: 4 },
        list_item: { marginBottom: 2 },
        code_inline: {
          backgroundColor: tone === 'light' ? '#262626' : '#e5e5e5',
          color: textColor,
          borderRadius: 4,
          paddingHorizontal: 4,
        },
        code_block: {
          backgroundColor: tone === 'light' ? '#262626' : '#e5e5e5',
          borderRadius: 8,
          padding: 8,
        },
        fence: {
          backgroundColor: tone === 'light' ? '#262626' : '#e5e5e5',
          borderRadius: 8,
          padding: 8,
        },
        table: { borderWidth: 1, borderColor, borderRadius: 6, marginVertical: 6 },
        thead: { backgroundColor: tone === 'light' ? '#262626' : '#e5e5e5' },
        th: { padding: 6, color: textColor, fontWeight: '700', fontSize: verticalScale(13) },
        td: { padding: 6, color: textColor, fontSize: verticalScale(13), borderColor },
        hr: { backgroundColor: borderColor, height: 1, marginVertical: 8 },
        link: { color: '#a3e635' },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: '#a3e635',
          paddingLeft: 8,
          opacity: 0.9,
        },
        text: { color: textColor },
      }}
      mergeStyle
    >
      {content}
    </Markdown>
  )
}
