import { Camera01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

interface TakePhotoProps {
  /** What the button says; without it, only the icon. */
  label?: string
  ariaLabel: string
  className?: string
  disabled?: boolean
  onTake: (files: FileList | null) => void
}

/**
 * Opens the device's camera app and hands back the photo, so the page never handles a camera stream. Shown on touch
 * devices only (styles.css): elsewhere the browser would just open the file chooser.
 */
export default function TakePhoto({ label, ariaLabel, className = 'button button-dark', disabled, onTake }: TakePhotoProps) {
  return (
    <label className={`take-photo ${className}`}>
      <HugeiconsIcon icon={Camera01Icon} size={16} aria-hidden="true" />
      {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          onTake(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
        aria-label={ariaLabel}
        disabled={disabled}
      />
    </label>
  )
}
