import Typo from '@/components/Typo'
import { BarChart, LineChart, PieChart } from '@/lib/charts'
import type { FynnChartSpec } from '@/lib/services/fynn'
import { verticalScale } from '@/utils/styling'
import React, { useMemo, useState } from 'react'
import { Dimensions, View } from 'react-native'

const PALETTE = ['#a3e635', '#38bdf8', '#f472b6', '#fbbf24', '#c084fc', '#4ade80']
const SCREEN_WIDTH = Dimensions.get('window').width
/** Screen padding + heart column + chart card padding. */
const FALLBACK_WIDTH = Math.max(180, SCREEN_WIDTH - 96)

type Props = { chart: FynnChartSpec }

type NormalizedChart = {
  type: 'line' | 'bar' | 'pie'
  title: string
  labels: string[]
  values: number[]
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeChart(chart: FynnChartSpec): NormalizedChart | null {
  if (!chart) return null

  const type =
    chart.chart_type === 'pie' || chart.chart_type === 'line' || chart.chart_type === 'bar'
      ? chart.chart_type
      : 'bar'

  const labels = Array.isArray(chart.labels) ? chart.labels.map((label) => String(label ?? '')) : []
  const seriesInput = Array.isArray(chart.series)
    ? chart.series
    : chart.series && typeof chart.series === 'object'
      ? [chart.series as { values?: unknown }]
      : []

  const rawValues = Array.isArray(seriesInput[0]?.values) ? seriesInput[0].values : []
  const count = Math.max(labels.length, rawValues.length)
  if (count === 0) return null

  return {
    type,
    title: chart.title ? String(chart.title) : '',
    labels: Array.from({ length: count }, (_, i) => labels[i] || String(i + 1)),
    values: Array.from({ length: count }, (_, i) => toNumber(rawValues[i])),
  }
}

function formatAxis(value: number) {
  const abs = Math.abs(value)
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
  return String(Math.round(value))
}

/**
 * Fynn only ever hands us structured numbers via the render_chart tool
 * (never an image), so this maps that spec onto a real, precise native chart
 * instead of trusting the model to draw anything itself.
 *
 * Import through `@/lib/charts` (deep paths) — the gifted-charts barrel breaks Metro.
 */
export default function ChatChart({ chart }: Props) {
  const normalized = useMemo(() => normalizeChart(chart), [chart])
  const [measuredWidth, setMeasuredWidth] = useState(FALLBACK_WIDTH)

  if (!normalized) return null

  const { type, title, labels, values } = normalized
  const chartWidth = Math.max(160, measuredWidth - 8)
  const maxValue = Math.max(...values, 0)
  const yMax = maxValue > 0 ? maxValue * 1.15 : 1
  const needsScroll = labels.length > 5
  const barWidth = Math.max(12, Math.min(22, Math.floor(chartWidth / Math.max(labels.length, 1)) - 10))
  const barSpacing = needsScroll
    ? 16
    : Math.max(10, Math.floor((chartWidth - labels.length * barWidth) / Math.max(labels.length, 1)))
  const lineSpacing = needsScroll
    ? 42
    : Math.max(28, Math.floor((chartWidth - 24) / Math.max(labels.length, 1)))

  const axisLabelStyle = { color: '#a3a3a3', fontSize: 10 }

  return (
    <View
      className="mt-3 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 p-3"
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width)
        if (next > 0 && Math.abs(next - measuredWidth) > 2) setMeasuredWidth(next)
      }}
    >
      {title ? (
        <Typo size={13} fontWeight="600" className="mb-3 text-neutral-200">
          {title}
        </Typo>
      ) : null}

      {type === 'pie' ? (
        <View className="items-center">
          <PieChart
            data={labels.map((label, i) => ({
              value: values[i] ?? 0,
              color: PALETTE[i % PALETTE.length],
              text: '',
            }))}
            donut
            radius={Math.min(verticalScale(78), chartWidth / 2 - 8)}
            innerRadius={Math.min(verticalScale(44), chartWidth / 4)}
            innerCircleColor="#171717"
            showText={false}
            focusOnPress
          />
          <View className="mt-3 w-full gap-1.5">
            {labels.map((label, i) => (
              <View key={`${label}-${i}`} className="flex-row items-center justify-between gap-2">
                <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                  <View
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                    className="h-2.5 w-2.5 rounded-full"
                  />
                  <Typo size={11} className="flex-1 text-neutral-400" textProps={{ numberOfLines: 1 }}>
                    {label}
                  </Typo>
                </View>
                <Typo size={11} className="text-neutral-300">{formatAxis(values[i] ?? 0)}</Typo>
              </View>
            ))}
          </View>
        </View>
      ) : type === 'line' ? (
        <LineChart
          data={labels.map((label, i) => ({
            value: values[i] ?? 0,
            label,
            labelTextStyle: axisLabelStyle,
          }))}
          width={chartWidth}
          height={verticalScale(150)}
          color="#a3e635"
          thickness={2.5}
          dataPointsColor="#a3e635"
          dataPointsRadius={3}
          yAxisTextStyle={axisLabelStyle}
          xAxisLabelTextStyle={axisLabelStyle}
          rulesColor="#333333"
          rulesType="solid"
          yAxisColor="transparent"
          xAxisColor="#333333"
          yAxisThickness={0}
          xAxisThickness={1}
          noOfSections={4}
          maxValue={yMax}
          formatYLabel={(value) => formatAxis(Number(value))}
          initialSpacing={12}
          endSpacing={20}
          spacing={lineSpacing}
          areaChart
          startFillColor="#a3e635"
          startOpacity={0.25}
          endOpacity={0}
          curved={false}
          disableScroll={!needsScroll}
          showScrollIndicator={needsScroll}
          nestedScrollEnabled
          backgroundColor="transparent"
        />
      ) : (
        <BarChart
          data={labels.map((label, i) => ({
            value: values[i] ?? 0,
            label,
            frontColor: '#a3e635',
            labelTextStyle: axisLabelStyle,
          }))}
          width={chartWidth}
          height={verticalScale(150)}
          yAxisTextStyle={axisLabelStyle}
          xAxisLabelTextStyle={axisLabelStyle}
          rulesColor="#333333"
          rulesType="solid"
          yAxisColor="transparent"
          xAxisColor="#333333"
          yAxisThickness={0}
          xAxisThickness={1}
          noOfSections={4}
          maxValue={yMax}
          formatYLabel={(value) => formatAxis(Number(value))}
          barWidth={barWidth}
          spacing={barSpacing}
          initialSpacing={12}
          endSpacing={16}
          roundedTop
          disableScroll={!needsScroll}
          showScrollIndicator={needsScroll}
          nestedScrollEnabled
        />
      )}
    </View>
  )
}
