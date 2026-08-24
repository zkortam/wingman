interface DotsProps {
  n: number
  passCount: number
}

const diameter = 10
const gap = 6

export const Dots = ({ n, passCount }: DotsProps) => {
  const width = n * diameter + (n - 1) * gap
  return (
    <span className="dots-line">
      <svg
        aria-label={`${passCount} of ${n} runs passed`}
        className="dots-svg"
        height={diameter}
        role="img"
        viewBox={`0 0 ${width} ${diameter}`}
        width={width}
      >
        {Array.from({ length: n }, (_, index) => {
          const passed = index >= n - passCount
          return (
            <circle
              cx={index * (diameter + gap) + diameter / 2}
              cy={diameter / 2}
              fill={passed ? 'none' : 'var(--fail)'}
              key={index}
              r={passed ? 4.25 : 5}
              stroke={passed ? 'var(--pass)' : 'none'}
              strokeWidth={passed ? 1.5 : 0}
            />
          )
        })}
      </svg>
      <span className="dots-count">
        {passCount}/{n} passed
      </span>
    </span>
  )
}
