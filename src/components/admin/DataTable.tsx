"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** provide to make the column sortable */
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
};

type Sort = { id: string; dir: "asc" | "desc" };

/* Generic client-side table: search, sortable columns and pagination over an
   in-memory array (list endpoints return capped arrays). */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  searchable,
  searchPlaceholder = "Search…",
  searchValue,
  onSearchChange,
  toolbar,
  pageSize = 10,
  empty,
}: {
  data: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchable?: (row: T) => string;
  searchPlaceholder?: string;
  /** pass both to control the search box (persisted filters, exports) */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  toolbar?: ReactNode;
  pageSize?: number;
  empty?: ReactNode;
}) {
  const [innerQuery, setInnerQuery] = useState("");
  const query = searchValue ?? innerQuery;
  const setQuery = onSearchChange ?? setInnerQuery;
  const [sort, setSort] = useState<Sort | null>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return data;
    const q = query.toLowerCase();
    return data.filter((r) => searchable(r).toLowerCase().includes(q));
  }, [data, query, searchable]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, totalPages);
  const rows = sorted.slice((current - 1) * pageSize, current * pageSize);

  /* reset to page 1 when the result set changes size */
  useEffect(() => setPage(1), [query, sorted.length]);

  const toggleSort = (id: string) =>
    setSort((s) =>
      s?.id === id ? (s.dir === "asc" ? { id, dir: "desc" } : null) : { id, dir: "asc" }
    );

  return (
    <div className="space-y-3">
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-8"
                aria-label="Search"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((c) => (
                <TableHead key={c.id} className={cn("h-10 text-xs", c.headerClassName)}>
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.id)}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-foreground"
                    >
                      {c.header}
                      {sort?.id === c.id ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    <span className="font-semibold uppercase tracking-wide">{c.header}</span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty ?? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No results.</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {columns.map((c) => (
                    <TableCell key={c.id} className={cn("py-2.5", c.className)}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {sorted.length === 0
            ? "0 results"
            : `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, sorted.length)} of ${sorted.length}`}
        </p>
        {totalPages > 1 && (
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={current === 1}
                  className={cn(current === 1 && "pointer-events-none opacity-50")}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.max(1, p - 1));
                  }}
                />
              </PaginationItem>
              {Array.from({ length: totalPages })
                .map((_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - current) <= 1)
                .map((p, idx, arr) => (
                  <PaginationItem key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 ? (
                      <span className="px-2 text-muted-foreground">…</span>
                    ) : null}
                    <PaginationLink
                      href="#"
                      isActive={p === current}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(p);
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={current === totalPages}
                  className={cn(current === totalPages && "pointer-events-none opacity-50")}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}
