[@bigcommerce/checkout-sdk](../README.md) / BaseElementOptions

# Interface: BaseElementOptions

## Hierarchy

- **`BaseElementOptions`**

  ↳ [`BaseIndividualElementOptions`](BaseIndividualElementOptions.md)

  ↳ [`CardElementOptions`](CardElementOptions.md)

  ↳ [`IbanElementOptions`](IbanElementOptions.md)

  ↳ [`IdealElementOptions`](IdealElementOptions.md)

## Table of contents

### Properties

- [classes](BaseElementOptions.md#classes)
- [disabled](BaseElementOptions.md#disabled)
- [style](BaseElementOptions.md#style)

## Properties

### classes

• `Optional` **classes**: [`StripeElementClasses`](StripeElementClasses.md)

Set custom class names on the container DOM element when the Stripe element is in a particular state.

___

### disabled

• `Optional` **disabled**: `boolean`

Applies a disabled state to the Element such that user input is not accepted. Default is false.

___

### style

• `Optional` **style**: [`StripeElementStyle`](StripeElementStyle.md)

Customize the appearance of an element using CSS properties passed in a [Style](https://stripe.com/docs/js/appendix/style) object,
which consists of CSS properties nested under objects for each variant.
