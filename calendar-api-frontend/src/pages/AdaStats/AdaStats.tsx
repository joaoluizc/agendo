import React, { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdaSearch {
  requestedAt: string;
  latency: number;
  cacheHit: boolean;
  success: boolean;
}

const fetchAdaSearches = async (from: string, to: string) => {
  const params = new URLSearchParams({
    from,
    to,
  });
  const res = await fetch(`api/ada/searches?${params}`);
  return res.json();
};

const getISODate = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

const AdaStats: React.FC = () => {
  const [searches, setSearches] = useState<AdaSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("90d");

  useEffect(() => {
    const from = getISODate(90);
    const to = getISODate(0);
    fetchAdaSearches(from, to).then((data) => {
      setSearches(data);
      setLoading(false);
    });
  }, []);

  // Prepare chart data: each point is a search query, split for cacheHit and nonCacheHit
  let cacheHitData: { date: string; latency: number }[] = [];
  let nonCacheHitData: { date: string; latency: number }[] = [];
  searches.forEach((s) => {
    if (s.success && s.cacheHit) {
      cacheHitData.push({ date: s.requestedAt, latency: s.latency });
    } else if (s.success && !s.cacheHit) {
      nonCacheHitData.push({ date: s.requestedAt, latency: s.latency });
    }
  });

  // Filter by time range
  const getFiltered = (data: { date: string; latency: number }[]) => {
    const referenceDate = data.length
      ? new Date(data[data.length - 1].date)
      : new Date();
    let daysToSubtract = 90;
    if (timeRange === "30d") daysToSubtract = 30;
    if (timeRange === "7d") daysToSubtract = 7;
    const startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - daysToSubtract);
    return data.filter((item) => new Date(item.date) >= startDate);
  };
  const filteredCacheHitData = getFiltered(cacheHitData);
  const filteredNonCacheHitData = getFiltered(nonCacheHitData);

  const cacheHitConfig: ChartConfig = {
    latency: {
      label: "Cache Hit Latency",
      color: "var(--chart-2)",
    },
  };
  const nonCacheHitConfig: ChartConfig = {
    latency: {
      label: "Non-Cache Hit Latency",
      color: "var(--chart-1)",
    },
  };

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Ada Search Latency</CardTitle>
          <CardDescription>
            Showing average latency for cache hits and non-cache hits
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
            aria-label="Select a value"
          >
            <SelectValue placeholder="Last 3 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              Last 3 months
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              Last 7 days
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="flex flex-col gap-8">
            <div>
              <h2 className="text-lg font-semibold mb-2">
                Non-Cache Hit Latency
              </h2>
              <ChartContainer
                config={nonCacheHitConfig}
                className="aspect-auto h-[250px] w-full"
              >
                <AreaChart data={filteredNonCacheHitData} accessibilityLayer>
                  <defs>
                    <linearGradient
                      id="fillNonCache"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    }}
                  />
                  <YAxis
                    label={{ value: "ms", angle: -90, position: "insideLeft" }}
                    allowDecimals={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => {
                          return new Date(value).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }}
                        indicator="dot"
                      />
                    }
                  />
                  <Area
                    dataKey="latency"
                    type="natural"
                    fill="url(#fillNonCache)"
                    stroke="var(--chart-1)"
                    name="Non-Cache Hit Latency"
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">Cache Hit Latency</h2>
              <ChartContainer
                config={cacheHitConfig}
                className="aspect-auto h-[250px] w-full"
              >
                <AreaChart data={filteredCacheHitData} accessibilityLayer>
                  <defs>
                    <linearGradient id="fillCache" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--chart-2)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--chart-2)"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    }}
                  />
                  <YAxis
                    label={{ value: "ms", angle: -90, position: "insideLeft" }}
                    allowDecimals={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => {
                          return new Date(value).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          });
                        }}
                        indicator="dot"
                      />
                    }
                  />
                  <Area
                    dataKey="latency"
                    type="natural"
                    fill="url(#fillCache)"
                    stroke="var(--chart-2)"
                    name="Cache Hit Latency"
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdaStats;
