export const KeyHint = ({ keys }: { keys: string[] }) => (
  <span className="key-hint">
    {keys.map((key) => (
      <kbd key={key}>{key}</kbd>
    ))}
  </span>
)
