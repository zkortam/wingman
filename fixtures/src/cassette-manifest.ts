export const requiredCassetteRequests = [
  {
    model: 'demo',
    messages: [
      {
        role: 'user',
        content: 'Export these opportunities',
        context: { viewFilters: { stage: 'Negotiation' }, variance: true },
      },
    ],
  },
]
