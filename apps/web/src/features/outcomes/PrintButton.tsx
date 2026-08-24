'use client'

export const PrintButton = () => (
  <button className="print-button" onClick={() => window.print()} type="button">Print / PDF</button>
)
