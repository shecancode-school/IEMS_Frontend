"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export const description = "Check-ins over time"

type Daily = { day: string; count: number }
type Hourly = { hour: string; count: number }

const pad = (n: number) => String(n).padStart(2, "0")
const dayKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const hourKey = (d: Date) => `${dayKey(d)}T${pad(d.getUTCHours())}:00`

function fillDaily(data: Daily[], days: number) {
  const map = new Map(data.map((d) => [d.day, d.count]))
  const out: { label: string; count: number }[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(now.getUTCDate() - i)
    out.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      count: map.get(dayKey(d)) ?? 0,
    })
  }
  return out
}

function fillHourly(data: Hourly[]) {
  const map = new Map(data.map((d) => [d.hour, d.count]))
  const out: { label: string; count: number }[] = []
  const now = new Date()
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCHours(now.getUTCHours() - i, 0, 0, 0)
    out.push({
      label: d.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" }),
      count: map.get(hourKey(d)) ?? 0,
    })
  }
  return out
}

const chartConfig = {
  count: { label: "Check-ins", color: "var(--primary)" },
} satisfies ChartConfig

export function ChartAreaInteractive({
  daily = [],
  hourly = [],
}: {
  daily?: Daily[]
  hourly?: Hourly[]
}) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("30d")

  React.useEffect(() => {
    if (isMobile) setTimeRange("24h")
  }, [isMobile])

  const chartData = React.useMemo(() => {
    if (timeRange === "24h") return fillHourly(hourly)
    return fillDaily(daily, timeRange === "7d" ? 7 : 30)
  }, [timeRange, daily, hourly])

  const total = chartData.reduce((s, d) => s + d.count, 0)

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Check-ins</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            {total} gate scans in this window
          </span>
          <span className="@[540px]/card:hidden">{total} scans</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(v) => v && setTimeRange(v)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
            <ToggleGroupItem value="24h">Last 24 hours</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 30 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
              <SelectItem value="24h" className="rounded-lg">
                Last 24 hours
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillCheckins" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-count)" stopOpacity={1.0} />
                <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              interval="preserveStartEnd"
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area
              dataKey="count"
              type="natural"
              fill="url(#fillCheckins)"
              stroke="var(--color-count)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
