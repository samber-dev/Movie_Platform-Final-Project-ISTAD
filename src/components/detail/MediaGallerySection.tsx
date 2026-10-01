'use client'

import { useEffect, useState } from 'react'
import { loadMediaGallery, TMDB_IMG_ORIGINAL, TMDB_IMG_W500 } from '../../lib/tmdb'
import type { MediaGallery, MediaImage } from '../../lib/tmdb'
import { useAsyncSection } from '../../lib/useAsyncSection'
import type { Media } from '../../types'
import { CardSkeleton, SectionMessage, SectionShell } from './SectionShell'
import { useSectionMessage } from './sectionUtils'

type Tab = 'backdrops' | 'posters'

function Lightbox({
  image,
  alt,
  onClose,
  onPrev,
  onNext,
}: {
  image: MediaImage
  alt: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Capture phase on window, so this runs before the detail dialog's own
        // `document` listener. Without the stop, one Escape press would close
        // the lightbox and the whole detail view at once.
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.stopPropagation()
        onPrev()
      }
      if (event.key === 'ArrowRight') {
        event.stopPropagation()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} image viewer`}
    >
      <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        <img
          src={`${TMDB_IMG_ORIGINAL}${image.path}`}
          alt={alt}
          className="mx-auto max-h-[80vh] w-auto rounded-xl object-contain shadow-2xl"
        />
        <p className="mt-3 text-center text-xs text-ink-soft">
          {image.width} × {image.height}
          {image.language && image.language !== 'en' ? ` · ${image.language}` : ''}
        </p>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          className="absolute -top-2 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-page/85 text-lg text-ink ring-1 ring-line backdrop-blur transition hover:bg-page sm:-right-2 sm:top-0"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous image"
          className="absolute -left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-page/85 text-ink ring-1 ring-line backdrop-blur transition hover:bg-page"
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next image"
          className="absolute -right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-page/85 text-ink ring-1 ring-line backdrop-blur transition hover:bg-page"
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}

function GalleryTile({
  image,
  alt,
  widthClass,
  ratioClass,
  onOpen,
}: {
  image: MediaImage
  alt: string
  widthClass: string
  ratioClass: string
  onOpen: () => void
}) {
  return (
    <li className={`shrink-0 ${widthClass}`}>
      <button
        type="button"
        onClick={onOpen}
        className={`group block w-full overflow-hidden rounded-xl ring-1 ring-line transition hover:ring-accent ${ratioClass}`}
        aria-label={`View ${alt} at full size`}
      >
        <img
          src={`${TMDB_IMG_W500}${image.path}`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      </button>
    </li>
  )
}

export function MediaGallerySection({ item }: { item: Media }) {
  const state = useAsyncSection<MediaGallery>(
    (signal) => loadMediaGallery(item, signal),
    [item.type, item.id],
  )
  const [tab, setTab] = useState<Tab>('backdrops')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const { showSkeleton, showError } = useSectionMessage(state)

  const gallery = state.data
  const list = gallery ? gallery[tab] : []
  const otherCount = gallery ? gallery[tab === 'backdrops' ? 'posters' : 'backdrops'].length : 0

  return (
    <SectionShell
      id="media"
      title="Media Gallery"
      subtitle="Backdrops and posters at high resolution"
      action={
        gallery && gallery.backdrops.length + gallery.posters.length > 0 ? (
          <div
            className="flex rounded-full bg-surface-2 p-1 ring-1 ring-line"
            role="tablist"
            aria-label="Gallery type"
          >
            {(['backdrops', 'posters'] as const).map((key) => {
              const count = gallery[key].length
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => {
                    setTab(key)
                    setLightboxIndex(null)
                  }}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition ${
                    tab === key
                      ? 'bg-accent text-on-accent'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {key} ({count})
                </button>
              )
            })}
          </div>
        ) : null
      }
    >
      {showSkeleton && (
        <CardSkeleton count={4} className="aspect-video w-64 sm:w-80" />
      )}

      {showError && (
        <SectionMessage tone="error" onRetry={state.reload}>
          Could not load the gallery. {state.error}
        </SectionMessage>
      )}

      {gallery && gallery.backdrops.length + gallery.posters.length === 0 && (
        <SectionMessage>
          No images have been added for this title yet.
        </SectionMessage>
      )}

      {list.length > 0 && (
        <>
          <ul
            className={`mt-5 flex gap-4 overflow-x-auto pb-3 ${
              tab === 'backdrops' ? 'snap-x' : ''
            }`}
          >
            {list.map((image, index) => (
              <GalleryTile
                key={image.path}
                image={image}
                alt={`${item.title} ${tab === 'backdrops' ? 'backdrop' : 'poster'} ${index + 1}`}
                widthClass={tab === 'backdrops' ? 'w-64 sm:w-80' : 'w-36'}
                ratioClass={tab === 'backdrops' ? 'aspect-video' : 'aspect-[2/3]'}
                onOpen={() => setLightboxIndex(index)}
              />
            ))}
          </ul>
          {tab === 'posters' && otherCount > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Switch to Backdrops to see {otherCount} more still
              {otherCount === 1 ? '' : 's'}.
            </p>
          )}
        </>
      )}

      {lightboxIndex !== null && list[lightboxIndex] && (
        <Lightbox
          image={list[lightboxIndex]}
          alt={`${item.title} ${tab === 'backdrops' ? 'backdrop' : 'poster'} ${lightboxIndex + 1}`}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex((current) =>
              current === null ? null : (current - 1 + list.length) % list.length,
            )
          }
          onNext={() =>
            setLightboxIndex((current) =>
              current === null ? null : (current + 1) % list.length,
            )
          }
        />
      )}
    </SectionShell>
  )
}
