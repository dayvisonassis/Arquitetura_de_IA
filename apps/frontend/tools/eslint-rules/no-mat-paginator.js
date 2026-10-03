module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Paginated tables use tails-pagination, never mat-paginator'
    },
    schema: [],
    messages: {
      matPaginator:
        'Use the tails-pagination component instead of mat-paginator (design system: Pagination).'
    }
  },
  create(context) {
    return {
      'Element$1[name="mat-paginator"]'(node) {
        context.report({ node, messageId: 'matPaginator' })
      }
    }
  }
}
