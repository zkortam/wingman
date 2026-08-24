export const Toast = ({ message }: { message: string }) => (
  <div aria-live="polite" className="toast" role="status">
    {message}
  </div>
)
