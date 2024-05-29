import { PaymentMethod } from '@bigcommerce/checkout-sdk/payment-integration-api';

import { Masterpass } from './masterpass';

export function getMasterpass(): PaymentMethod {
    return {
        id: 'masterpass',
        logoUrl: '',
        method: 'masterpass',
        supportedCards: ['VISA', 'MC', 'AMEX'],
        config: {
            displayName: 'Masterpass',
            testMode: false,
        },
        type: 'PAYMENT_TYPE_API',
    };
}

export function getMasterpassScriptMock(): Masterpass {
    return {
        checkout: jest.fn(),
    };
}

export function getCallbackUrlMock(): string {
    return 'http://localhost/checkout.php?action=set_external_checkout&provider=masterpass&gateway=stripe&origin=checkout';
}
