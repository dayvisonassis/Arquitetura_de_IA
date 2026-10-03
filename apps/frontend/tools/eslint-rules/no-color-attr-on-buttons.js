const MATERIAL_BUTTONS = new Set([
  'mat-button',
  'mat-flat-button',
  'mat-raised-button',
  'mat-stroked-button',
  'mat-icon-button',
  'mat-fab',
  'mat-mini-fab'
])

const hasAttribute = (element, name) =>
  element.attributes.some(attribute => attribute.name === name)

const isDialogActions = element =>
  element.name === 'mat-dialog-actions' ||
  hasAttribute(element, 'mat-dialog-actions')

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Material buttons take their colour from CSS classes, not from the color attribute'
    },
    schema: [],
    messages: {
      colorAttribute:
        'Do not set color on a Material button: use the design-system button classes. Only color="primary" inside mat-dialog-actions is allowed.'
    }
  },
  create(context) {
    const ancestors = []
    return {
      Element$1(element) {
        const isButton = element.attributes.some(attribute =>
          MATERIAL_BUTTONS.has(attribute.name)
        )
        if (isButton) {
          const staticColor = element.attributes.find(
            attribute => attribute.name === 'color'
          )
          const boundColor = element.inputs.find(
            input => input.name === 'color'
          )
          const allowedPrimary =
            !boundColor &&
            staticColor?.value === 'primary' &&
            ancestors.some(isDialogActions)
          if ((staticColor || boundColor) && !allowedPrimary) {
            context.report({ node: element, messageId: 'colorAttribute' })
          }
        }
        ancestors.push(element)
      },
      'Element$1:exit'() {
        ancestors.pop()
      }
    }
  }
}
