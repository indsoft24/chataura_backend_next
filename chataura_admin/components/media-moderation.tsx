'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import {
  AdminStyles,
  applyRange,
  Avatar,
  DateRangeChips,
  EmptyRow,
  errorText,
  fmt,
  formatDate,
  formatTime,
  Pager,
  pick,
  positiveInt,
  RANGE_KEYS,
  RangeKey,
  SearchBox,
  SkeletonRows,
  SortTh,
  Tabs,
  useConfirm,
  useDebouncedCommit,
  useToasts,
  useUrlFilters,
} from '@/components/admin-ui';

type MediaItem = {
  id: number;
  caption: string | null;
  media_url: string;
  media_type?: string;
  thumbnail_url: string | null;
  likes_count: number;
  comments_count: number;
  views_count?: number;
  shares_count?: number;
  duration?: number | null;
  is_deleted?: boolean;
  created_at: string;
  user: { id: number; name: string | null; email?: string | null; avatar_url: string | null };
};

type Counts = { live: number; removed: number; all: number };

const DEFAULTS = {
  q: '',
  status: 'live' as 'live' | 'removed' | 'all',
  user_id: '',
  caption: '' as '' | 'yes' | 'no',
  range: 'all' as RangeKey,
  from: '',
  to: '',
  sort: 'id',
  order: 'desc' as 'asc' | 'desc',
  view: 'table' as 'table' | 'grid',
  limit: 20,
  page: 1,
};
type Filters = typeof DEFAULTS;

function parse(p: URLSearchParams): Filters {
  return {
    q: p.get('q') ?? '',
    status: pick(p.get('status'), ['live', 'removed', 'all'] as const, 'live'),
    user_id: /^\d+$/.test(p.get('user_id') ?? '') ? p.get('user_id')! : '',
    caption: pick(p.get('caption'), ['', 'yes', 'no'] as const, ''),
    range: pick(p.get('range'), RANGE_KEYS, 'all'),
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    sort: pick(p.get('sort'), ['id', 'likes', 'comments', 'views'] as const, 'id'),
    order: pick(p.get('order'), ['asc', 'desc'] as const, 'desc'),
    view: pick(p.get('view'), ['table', 'grid'] as const, 'table'),
    limit: [20, 50, 100].includes(Number(p.get('limit'))) ? Number(p.get('limit')) : 20,
    page: positiveInt(p.get('page'), 1),
  };
}

function isVideo(m: MediaItem) {
  return m.media_type === 'video' || /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(m.media_url);
}

export function MediaModeration({ kind }: { kind: 'post' | 'reel' }) {
  const isReel = kind === 'reel';
  const noun = isReel ? 'reel' : 'post';
  const Noun = isReel ? 'Reel' : 'Post';
  const endpoint = isReel ? '/admin/media/reels' : '/admin/media/posts';

  const { token } = useAdminAuth();
  const { filters, setFilters, update, reset, ready } = useUrlFilters(DEFAULTS, parse);
  const isDirty = (Object.keys(DEFAULTS) as (keyof Filters)[]).some(
    (k) => k !== 'view' && k !== 'page' && k !== 'limit' && filters[k] !== DEFAULTS[k],
  );
  const [searchInput, setSearchInput] = useState('');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ live: 0, removed: 0, all: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { toast, toastNode } = useToasts();
  const { confirm, confirmNode } = useConfirm();
  const seq = useRef(0);

  useEffect(() => {
    if (ready) setSearchInput(filters.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useDebouncedCommit(searchInput, (q) => {
    if (ready) setFilters((f) => (f.q === q ? f : { ...f, q, page: 1 }));
  });

  const load = useCallback(async () => {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok) return;
    const id = ++seq.current;
    setLoading(true);
    setLoadError(null);
    const p = new URLSearchParams({
      page: String(filters.page),
      limit: String(filters.limit),
      sort: filters.sort,
      order: filters.order,
      status: filters.status,
    });
    (['q', 'user_id', 'caption'] as const).forEach((k) => {
      if (filters[k]) p.set(k, filters[k]);
    });
    applyRange(p, filters.range, filters.from, filters.to);
    try {
      const res = await api<{ data?: { items?: MediaItem[]; posts?: MediaItem[]; reels?: MediaItem[]; counts?: Counts; meta?: { total?: number; pages?: number } } }>(
        `${endpoint}?${p.toString()}`,
        tok,
      );
      if (id !== seq.current) return;
      const pages = Math.max(1, Number(res.data?.meta?.pages ?? 1));
      setItems(res.data?.items ?? res.data?.posts ?? res.data?.reels ?? []);
      if (res.data?.counts) setCounts(res.data.counts);
      setTotal(Number(res.data?.meta?.total ?? 0));
      setTotalPages(pages);
      setSelected(new Set());
      if (filters.page > pages) setFilters((f) => ({ ...f, page: pages }));
    } catch (err) {
      if (id !== seq.current) return;
      setLoadError(errorText(err, `Failed to load ${noun}s`));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [filters, endpoint, noun, setFilters]);

  useEffect(() => {
    if (ready && token) void load();
  }, [ready, token, load]);

  const preview = previewIndex !== null ? items[previewIndex] ?? null : null;

  useEffect(() => {
    if (previewIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewIndex(null);
      if (e.key === 'ArrowRight') setPreviewIndex((i) => (i !== null && i < items.length - 1 ? i + 1 : i));
      if (e.key === 'ArrowLeft') setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewIndex, items.length]);

  function onSort(column: string, defaultOrder: 'asc' | 'desc') {
    if (filters.sort === column) update({ order: filters.order === 'desc' ? 'asc' : 'desc' });
    else update({ sort: column, order: defaultOrder });
  }

  function resetAll() {
    setSearchInput('');
    const view = filters.view;
    reset();
    setFilters((f) => ({ ...f, view }));
  }

  function toggleSelect(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const allOnPageSelected = items.length > 0 && items.every((m) => selected.has(m.id));

  async function runOn(ids: number[], action: 'remove' | 'restore') {
    const tok = localStorage.getItem('ca_admin_token');
    if (!tok || ids.length === 0) return;
    setBusyIds(new Set(ids));
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          action === 'remove'
            ? api(`${endpoint}/${id}`, tok, { method: 'DELETE' })
            : api(`/admin/media/${id}/restore`, tok, { method: 'POST' }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const ok = ids.length - failed;
      if (ok) toast('success', `${ok} ${noun}${ok === 1 ? '' : 's'} ${action === 'remove' ? 'removed' : 'restored'}`);
      if (failed) toast('error', `${failed} ${noun}${failed === 1 ? '' : 's'} failed`);
      await load();
    } finally {
      setBusyIds(new Set());
    }
  }

  function askRemove(ids: number[]) {
    confirm({
      title: ids.length === 1 ? `Remove ${noun} #${ids[0]}` : `Remove ${ids.length} ${noun}s`,
      message: (
        <>
          {ids.length === 1 ? `This ${noun} will` : `These ${noun}s will`} be hidden from the app feed immediately. You can restore
          {ids.length === 1 ? ' it' : ' them'} later from the <strong>Removed</strong> tab.
        </>
      ),
      confirmLabel: ids.length === 1 ? 'Remove' : `Remove ${ids.length}`,
      tone: 'danger',
      onConfirm: async () => {
        setPreviewIndex(null);
        await runOn(ids, 'remove');
      },
    });
  }

  function askRestore(ids: number[]) {
    confirm({
      title: ids.length === 1 ? `Restore ${noun} #${ids[0]}` : `Restore ${ids.length} ${noun}s`,
      message: <>{ids.length === 1 ? `This ${noun} will` : `These ${noun}s will`} be visible in the app feed again.</>,
      confirmLabel: ids.length === 1 ? 'Restore' : `Restore ${ids.length}`,
      tone: 'success',
      onConfirm: async () => {
        setPreviewIndex(null);
        await runOn(ids, 'restore');
      },
    });
  }

  const selectedItems = items.filter((m) => selected.has(m.id));
  const selectedLive = selectedItems.filter((m) => !m.is_deleted).map((m) => m.id);
  const selectedRemoved = selectedItems.filter((m) => m.is_deleted).map((m) => m.id);

  const sorts = [
    { value: 'id:desc', label: 'Newest first' },
    { value: 'id:asc', label: 'Oldest first' },
    { value: 'likes:desc', label: 'Most liked' },
    { value: 'comments:desc', label: 'Most commented' },
    ...(isReel ? [{ value: 'views:desc', label: 'Most viewed' }, { value: 'views:asc', label: 'Least viewed' }] : []),
  ];
  const sortValue = `${filters.sort}:${filters.order}`;
  const sortKnown = sorts.some((s) => s.value === sortValue);

  function thumb(m: MediaItem, className: string) {
    const src = m.thumbnail_url ?? (!isVideo(m) ? m.media_url : null);
    return (
      <div className={className} onClick={() => setPreviewIndex(items.indexOf(m))} role="button" tabIndex={0} title="Preview">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" />
        ) : isVideo(m) ? (
          <video src={m.media_url} muted preload="metadata" />
        ) : null}
        {isVideo(m) && <span className="mm-play">▶</span>}
        {m.is_deleted && <span className="mm-removed-tag">Removed</span>}
      </div>
    );
  }

  function authorCell(m: MediaItem) {
    const name = m.user?.name || `User #${m.user?.id}`;
    return (
      <div className="ad-user" style={{ minWidth: 160, maxWidth: 220 }}>
        <Avatar name={name} url={m.user?.avatar_url} size={30} />
        <div style={{ minWidth: 0 }}>
          <div className="ad-name" title={name}>{name}</div>
          <button type="button" className="ad-link" onClick={() => update({ user_id: String(m.user.id) })} title={`Only this user's ${noun}s`}>
            ID {m.user?.id}
          </button>
        </div>
      </div>
    );
  }

  function rowActions(m: MediaItem) {
    const busy = busyIds.has(m.id);
    return (
      <div className="ad-actions">
        <button type="button" className="ad-btn ad-btn-soft" disabled={busy} onClick={() => setPreviewIndex(items.indexOf(m))}>
          {isReel ? 'Play' : 'View'}
        </button>
        {m.is_deleted ? (
          <button type="button" className="ad-btn ad-btn-success-soft" disabled={busy} onClick={() => askRestore([m.id])}>Restore</button>
        ) : (
          <button type="button" className="ad-btn ad-btn-danger-soft" disabled={busy} onClick={() => askRemove([m.id])}>
            Remove
          </button>
        )}
      </div>
    );
  }

  return (
    <main className="ad-page">
      <AdminStyles />
      <style>{MEDIA_STYLES}</style>

      <div className="ad-header">
        <div>
          <h1>{isReel ? 'Video Reels Moderation' : 'Feed Posts Moderation'}</h1>
          <p>
            {isReel
              ? 'Review uploaded short videos, play them back and remove anything that breaks policy. Removed reels can be restored.'
              : 'Review public feed posts and remove policy-violating content. Removed posts can be restored.'}
          </p>
        </div>
        <div className="ad-header-actions">
          <div className="ad-seg" role="group" aria-label="View">
            <button type="button" className={`ad-seg-btn ${filters.view === 'table' ? 'is-active' : ''}`} onClick={() => setFilters((f) => ({ ...f, view: 'table' }))}>
              ☰ Table
            </button>
            <button type="button" className={`ad-seg-btn ${filters.view === 'grid' ? 'is-active' : ''}`} onClick={() => setFilters((f) => ({ ...f, view: 'grid' }))}>
              ▦ Grid
            </button>
          </div>
        </div>
      </div>

      <div className="ad-card">
        <Tabs
          value={filters.status}
          onChange={(v) => update({ status: v })}
          tabs={[
            { value: 'live', label: `Live ${noun}s`, count: counts.live, tone: 'green' },
            { value: 'removed', label: 'Removed', count: counts.removed, tone: 'red' },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />

        <div className="ad-range-row">
          <DateRangeChips range={filters.range} from={filters.from} to={filters.to} onChange={(patch) => update(patch)} />
        </div>

        <div className="ad-toolbar">
          <SearchBox
            value={searchInput}
            onChange={setSearchInput}
            onEnter={() => update({ q: searchInput.trim() })}
            placeholder={`Search caption, ${isReel ? 'creator' : 'author'} name/email, #${noun} ID or user ID…`}
          />
          <label className="ad-field">
            <span>Caption</span>
            <select value={filters.caption} onChange={(e) => update({ caption: e.target.value as Filters['caption'] })}>
              <option value="">Any</option>
              <option value="yes">With caption</option>
              <option value="no">No caption</option>
            </select>
          </label>
          <label className="ad-field">
            <span>Sort by</span>
            <select
              value={sortKnown ? sortValue : ''}
              onChange={(e) => {
                const [sort, order] = e.target.value.split(':');
                if (sort) update({ sort, order: order as 'asc' | 'desc' });
              }}
            >
              {!sortKnown && <option value="">Custom</option>}
              {sorts.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          {isDirty && (
            <button type="button" className="ad-btn ad-btn-ghost ad-btn-lg" onClick={resetAll}>Reset filters</button>
          )}
        </div>

        {filters.user_id && (
          <div className="ad-pills">
            <span className="ad-pill">
              User #{filters.user_id}
              <button type="button" onClick={() => update({ user_id: '' })} aria-label="Remove user filter">×</button>
            </span>
            <Link href={`/users?q=%23${filters.user_id}`} className="ad-link" style={{ alignSelf: 'center', marginLeft: 6 }}>
              Open user in User Management →
            </Link>
          </div>
        )}

        {selected.size > 0 ? (
          <div className="mm-bulk">
            <strong>{selected.size}</strong> selected
            {selectedLive.length > 0 && (
              <button type="button" className="ad-btn ad-btn-solid tone-danger" onClick={() => askRemove(selectedLive)}>
                Remove {selectedLive.length}
              </button>
            )}
            {selectedRemoved.length > 0 && (
              <button type="button" className="ad-btn ad-btn-solid tone-success" onClick={() => askRestore(selectedRemoved)}>
                Restore {selectedRemoved.length}
              </button>
            )}
            <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        ) : (
          <div className="ad-summary">
            {loading ? 'Loading…' : (
              <>
                <strong>{fmt(total)}</strong> {noun}{total === 1 ? '' : 's'}
                {filters.q ? <> matching “{filters.q}”</> : null}
                <span className="ad-hint"> · Click a thumbnail to preview · ← → to browse</span>
              </>
            )}
          </div>
        )}

        {loadError && (
          <div className="ad-alert">
            {loadError}
            <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void load()}>Retry</button>
          </div>
        )}

        {filters.view === 'table' ? (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th className="ad-th" style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="mm-check"
                      checked={allOnPageSelected}
                      onChange={() => setSelected(allOnPageSelected ? new Set() : new Set(items.map((m) => m.id)))}
                      aria-label="Select all on page"
                    />
                  </th>
                  <SortTh column="id" label={isReel ? 'Video' : 'Preview'} sort={filters.sort} order={filters.order} onSort={onSort} />
                  <th className="ad-th">{isReel ? 'Creator' : 'Author'}</th>
                  <th className="ad-th">Caption</th>
                  {isReel && <SortTh column="views" label="Views" sort={filters.sort} order={filters.order} onSort={onSort} align="right" />}
                  <SortTh column="likes" label="Likes" sort={filters.sort} order={filters.order} onSort={onSort} align="right" />
                  <SortTh column="comments" label="Comments" sort={filters.sort} order={filters.order} onSort={onSort} align="right" />
                  <th className="ad-th">Posted</th>
                  <th className="ad-th" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody className={loading && items.length > 0 ? 'is-loading' : ''}>
                {loading && items.length === 0 ? (
                  <SkeletonRows cols={isReel ? 9 : 8} />
                ) : items.length === 0 ? (
                  <EmptyRow cols={isReel ? 9 : 8} title={`No ${noun}s found`} hint="Try another tab or clear filters." onReset={isDirty ? resetAll : undefined} />
                ) : (
                  items.map((m) => (
                    <tr key={m.id} className={`ad-row ${busyIds.has(m.id) ? 'is-busy' : ''} ${selected.has(m.id) ? 'mm-selected' : ''}`}>
                      <td className="ad-td">
                        <input type="checkbox" className="mm-check" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} aria-label={`Select ${noun} ${m.id}`} />
                      </td>
                      <td className="ad-td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {thumb(m, isReel ? 'mm-thumb mm-thumb-tall' : 'mm-thumb')}
                          <span className="ad-id">#{m.id}</span>
                        </div>
                      </td>
                      <td className="ad-td">{authorCell(m)}</td>
                      <td className="ad-td">
                        <div className="mm-caption" title={m.caption ?? ''}>
                          {m.caption || <span className="ad-hint" style={{ fontStyle: 'italic' }}>No caption</span>}
                        </div>
                      </td>
                      {isReel && <td className="ad-td ad-num">{fmt(m.views_count)}</td>}
                      <td className="ad-td ad-num">{fmt(m.likes_count)}</td>
                      <td className="ad-td ad-num">{fmt(m.comments_count)}</td>
                      <td className="ad-td ad-nowrap">
                        <div>{formatDate(m.created_at)}</div>
                        <div className="ad-sub">{formatTime(m.created_at)}</div>
                      </td>
                      <td className="ad-td" style={{ textAlign: 'right' }}>{rowActions(m)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={`mm-grid ${loading && items.length > 0 ? 'is-loading' : ''}`}>
            {loading && items.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="ad-skeleton" style={{ height: isReel ? 320 : 260 }} />)
            ) : items.length === 0 ? (
              <div className="ad-empty" style={{ gridColumn: '1 / -1' }}>
                <div className="ad-empty-title">No {noun}s found</div>
                <div>Try another tab or clear filters.</div>
              </div>
            ) : (
              items.map((m) => (
                <div key={m.id} className={`mm-card ${selected.has(m.id) ? 'mm-selected' : ''} ${busyIds.has(m.id) ? 'is-busy' : ''}`}>
                  <label className="mm-card-check">
                    <input type="checkbox" className="mm-check" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} aria-label={`Select ${noun} ${m.id}`} />
                  </label>
                  {thumb(m, isReel ? 'mm-card-media mm-card-media-tall' : 'mm-card-media')}
                  <div className="mm-card-body">
                    {authorCell(m)}
                    <div className="mm-caption" style={{ maxWidth: 'none' }} title={m.caption ?? ''}>
                      {m.caption || <span className="ad-hint" style={{ fontStyle: 'italic' }}>No caption</span>}
                    </div>
                    <div className="ad-sub">
                      {isReel ? `👁 ${fmt(m.views_count)} · ` : ''}❤️ {fmt(m.likes_count)} · 💬 {fmt(m.comments_count)} · {formatDate(m.created_at)}
                    </div>
                    {rowActions(m)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <Pager
          page={filters.page}
          totalPages={totalPages}
          total={total}
          limit={filters.limit}
          loading={loading}
          onPage={(p) => setFilters((f) => ({ ...f, page: p }))}
          onLimit={(l) => update({ limit: l })}
        />
      </div>

      {preview && (
        <div className="mm-lightbox" onClick={() => setPreviewIndex(null)}>
          <div className="mm-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="mm-lightbox-media">
              {isVideo(preview) ? (
                <video key={preview.id} src={preview.media_url} controls autoPlay playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.media_url} alt="" />
              )}
              {previewIndex! > 0 && (
                <button type="button" className="mm-nav mm-nav-prev" onClick={() => setPreviewIndex((i) => (i ?? 1) - 1)} aria-label="Previous">‹</button>
              )}
              {previewIndex! < items.length - 1 && (
                <button type="button" className="mm-nav mm-nav-next" onClick={() => setPreviewIndex((i) => (i ?? 0) + 1)} aria-label="Next">›</button>
              )}
            </div>
            <aside className="mm-lightbox-side">
              <div className="ad-drawer-head">
                <div>
                  <div className="ad-sub">{Noun} #{preview.id} · {previewIndex! + 1} of {items.length} on this page</div>
                  {preview.is_deleted && <span className="ad-badge red" style={{ marginTop: 6 }}>Removed</span>}
                </div>
                <button type="button" className="ad-close" onClick={() => setPreviewIndex(null)} aria-label="Close">×</button>
              </div>
              {authorCell(preview)}
              <div className="mm-full-caption">
                {preview.caption || <span className="ad-hint" style={{ fontStyle: 'italic' }}>No caption</span>}
              </div>
              <dl className="ad-dl">
                {isReel && (<><dt>Views</dt><dd>{fmt(preview.views_count)}</dd></>)}
                <dt>Likes</dt><dd>{fmt(preview.likes_count)}</dd>
                <dt>Comments</dt><dd>{fmt(preview.comments_count)}</dd>
                {preview.duration ? (<><dt>Duration</dt><dd>{preview.duration}s</dd></>) : null}
                <dt>Posted</dt><dd>{new Date(preview.created_at).toLocaleString()}</dd>
                <dt>File</dt>
                <dd><a href={preview.media_url} target="_blank" rel="noreferrer">Open original ↗</a></dd>
              </dl>
              <div style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
                {preview.is_deleted ? (
                  <button type="button" className="ad-btn ad-btn-solid tone-success ad-btn-lg" onClick={() => askRestore([preview.id])}>Restore {noun}</button>
                ) : (
                  <button type="button" className="ad-btn ad-btn-solid tone-danger ad-btn-lg" onClick={() => askRemove([preview.id])}>Remove {noun}</button>
                )}
                <button
                  type="button"
                  className="ad-btn ad-btn-ghost ad-btn-lg"
                  onClick={() => {
                    update({ user_id: String(preview.user.id) });
                    setPreviewIndex(null);
                  }}
                >
                  Show all {noun}s by this user
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {confirmNode}
      {toastNode}
    </main>
  );
}

const MEDIA_STYLES = `
.mm-check { width: 16px; height: 16px; margin: 0; cursor: pointer; accent-color: #4f46e5; }
.mm-selected { background: #eef2ff !important; }
.mm-thumb { position: relative; width: 52px; height: 52px; border-radius: 8px; overflow: hidden; background: #e5e7eb; cursor: pointer; flex-shrink: 0; }
.mm-thumb-tall { width: 46px; height: 72px; background: #111827; }
.mm-thumb img, .mm-thumb video, .mm-card-media img, .mm-card-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.mm-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.9rem; text-shadow: 0 1px 4px rgba(0,0,0,0.6); pointer-events: none; }
.mm-removed-tag { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(185,28,28,0.85); color: #fff; font-size: 0.6rem; font-weight: 700; text-align: center; padding: 1px 0; text-transform: uppercase; }
.mm-caption { color: #374151; max-width: 280px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; }
.mm-bulk { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 20px 12px; padding: 8px 12px; border-radius: 10px; background: #eef2ff; color: #3730a3; font-size: 0.875rem; }

.mm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; padding: 4px 20px 12px; }
.mm-grid.is-loading { opacity: 0.6; }
.mm-card { position: relative; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column; transition: box-shadow 0.15s; }
.mm-card:hover { box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
.mm-card.is-busy { opacity: 0.55; pointer-events: none; }
.mm-card-check { position: absolute; top: 8px; left: 8px; z-index: 2; background: rgba(255,255,255,0.9); border-radius: 6px; padding: 4px; display: flex; }
.mm-card-media { position: relative; width: 100%; aspect-ratio: 1 / 1; background: #e5e7eb; cursor: pointer; }
.mm-card-media-tall { aspect-ratio: 9 / 14; background: #111827; }
.mm-card-media .mm-play { font-size: 2rem; }
.mm-card-body { padding: 12px; display: grid; gap: 8px; }
.mm-card-body .ad-actions { justify-content: flex-start; }

.mm-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 70; display: flex; align-items: center; justify-content: center; padding: 24px; }
.mm-lightbox-inner { display: flex; width: 100%; max-width: 1100px; height: min(86vh, 820px); background: #fff; border-radius: 14px; overflow: hidden; }
.mm-lightbox-media { position: relative; flex: 1; background: #000; display: flex; align-items: center; justify-content: center; min-width: 0; }
.mm-lightbox-media img, .mm-lightbox-media video { max-width: 100%; max-height: 100%; object-fit: contain; }
.ad-page .mm-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.15); color: #fff; font-size: 2rem; line-height: 1; padding: 6px 14px; border-radius: 999px; width: auto; }
.ad-page .mm-nav:hover { background: rgba(255,255,255,0.3); }
.mm-nav-prev { left: 12px; }
.mm-nav-next { right: 12px; }
.mm-lightbox-side { width: 340px; flex-shrink: 0; padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; box-sizing: border-box; }
.mm-full-caption { font-size: 0.925rem; color: #111827; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
@media (max-width: 800px) {
  .mm-lightbox-inner { flex-direction: column; height: 92vh; }
  .mm-lightbox-side { width: 100%; }
}
`;
