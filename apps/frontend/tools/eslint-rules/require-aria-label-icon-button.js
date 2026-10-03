const LABELS = new Set(['aria-label', 'aria-labelledby'])

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Every mat-icon-button needs an accessible name'
    },
    schema: [],
    messages: {
      missingLabel:
        'A mat-icon-button needs aria-label (or [attr.aria-label]): the icon alone has no accessible name.'
    }
  },
  create(context) {
    return {
      Element$1(element) {
        const isIconButton = element.attributes.some(
          attribute => attribute.name === 'mat-icon-button'
        )
        if (!isIconButton) {
          return
        }
        const labelled = [...element.attributes, ...element.inputs].some(
          attribute => LABELS.has(attribute.name)
        )
        if (!labelled) {
          context.report({ node: element, messageId: 'missingLabel' })
        }
      }
    }
  }
}
