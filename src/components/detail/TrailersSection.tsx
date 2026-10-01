'use client'

import { useEffect, useRef, useState } from 'react'
import {
  loadMediaVideos,
  youtubeEmbed,
  youtubeThumb,
} from '../../lib/tmdb'
import type { MediaVideo } from '../../lib/tmdb'
import { useAsyncSection } from '../../lib/useAsyncSection'
import type { Media } from '../../types'
import { CardSkeleton, SectionMessage, SectionShell } from './SectionShell'
import { useSectionMessage } from './sectionUtils'

function VideoThumbnail({
  video,
  active,
  onSelect,
}: {
  video: MediaVideo
  active: boolean
  onSelect: () => void
}) {
  const [thumbFailed, setThumbFailed] = useState(false)

  return (
    <li className="w-64 shrink-0 sm:w-72">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`group block w-full overflow-hidden rounded-xl text-left ring-1 transition ${
          active
            ? 'ring-2 ring-accent'
            : 'ring-line hover:ring-accent/60'
        }`}
      >
        <span className="relative block aspect-video w-full bg-ink">
          {thumbFailed ? (
            <span className="flex h-full w-full items-center justify-center gap-2 text-xs font-semibold text-ink-soft">
              <span aria-hidden="true">▶</span> Preview unavailable
            </span>
          ) : (
            <img
              src={youtubeThumb(video.key)}
              alt=""
              loading="lazy"
              onError={() => setThumbFailed(true)}
              className="h-full w-full object-cover"
            />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-page/85 via-page/10 to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-page/80 pl-1 text-ink ring-1 ring-line backdrop-blur transition group-hover:scale-110 group-hover:bg-page">
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
              </svg>
            </span>
          </span>
          {video.official && (
            <span className="absolute left-2 top-2 rounded bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-accent">
              Official
            </span>
          )}
        </span>
        <span className="block bg-surface/80 p-3">
          <span className="line-clamp-2 block text-sm font-semibold text-ink">
            {video.name}
          </span>
          <span className="mt-1 block text-xs text-ink-muted">
            {video.kind}
            {active ? ' · Now playing' : ''}
          </span>
        </span>
      </button>
    </li>
  )
}

export function TrailersSection({
  item,
  /** Bumped by the header's Play Trailer button to start the official clip. */
  playRequest,
}: {
  item: Media
  playRequest: number
}) {
  const state = useAsyncSection<MediaVideo[]>(
    (signal) => loadMediaVideos(item, signal),
    [item.type, item.id],
  )
  const [selection, setSelection] = useState<{ request: number; key: string | null }>({
    request: playRequest,
    key: null,
  })
  const playerRef = useRef<HTMLDivElement>(null)

  const videos = state.data ?? []
  const current = videos.find((v) => v.key === selection.key) ?? videos[0] ?? null
  const { showSkeleton, showError, showEmpty } = useSectionMessage(state)

  // A new "Play Trailer" request resets the player to the best-ranked clip.
  // Adjusted during render rather than in an effect, because the clip list may
  // still be loading when the button is pressed.
  if (playRequest !== selection.request && videos.length > 0) {
    setSelection({ request: playRequest, key: videos[0].key })
  }

  useEffect(() => {
    if (playRequest === 0) return
    playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [playRequest])

  return (
    <SectionShell
      id="trailers"
      title="Trailers & Videos"
      subtitle={
        showEmpty && videos.length > 0
          ? `${videos.length} official clip${videos.length === 1 ? '' : 's'} from YouTube`
          : undefined
      }
    >
      {showSkeleton && <CardSkeleton count={3} className="h-44 w-64 sm:w-72" />}

      {showError && (
        <SectionMessage tone="error" onRetry={state.reload}>
          Could not load videos. {state.error}
        </SectionMessage>
      )}

      {videos.length === 0 && showEmpty && (
        <SectionMessage>
          No trailers or clips are available for this title yet.
        </SectionMessage>
      )}

      {current && (
        <div className="mt-5 space-y-5">
          <div
            ref={playerRef}
            className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink ring-1 ring-line"
          >
            <iframe
              key={current.key}
              src={youtubeEmbed(current.key)}
              title={`${item.title} — ${current.name}`}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>

          <ul className="flex gap-4 overflow-x-auto pb-3">
            {videos.map((video) => (
              <VideoThumbnail
                key={video.key}
                video={video}
                active={video.key === current.key}
                onSelect={() =>
                  setSelection({ request: playRequest, key: video.key })
                }
              />
            ))}
          </ul>
        </div>
      )}
    </SectionShell>
  )
}
