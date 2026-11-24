interface EditIconProps {
  size?: number
}

/**
 * The pencil over a square that opens the photo editor (PhotoEditor), wherever a photo is loaded: the form, its
 * label photo, «Varias prendas» and «Desde un look». Drawn in the text colour; the button around it gives the name.
 */
export default function EditIcon({ size = 18 }: EditIconProps) {
  return (
    <svg className="edit-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit={10}>
        <path d="M11 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22H15C20 22 22 20 22 15V13" />
        <path d="M16.04 3.02L8.16 10.9C7.86 11.2 7.56 11.79 7.5 12.22L7.07 15.23C6.91 16.32 7.68 17.08 8.77 16.93L11.78 16.5C12.2 16.44 12.79 16.14 13.1 15.84L20.98 7.96C22.34 6.6 22.98 5.02 20.98 3.02C18.98 1.02 17.4 1.66 16.04 3.02Z" />
        <path d="M14.91 4.15C15.58 6.54 17.45 8.41 19.85 9.09" />
      </g>
    </svg>
  )
}
