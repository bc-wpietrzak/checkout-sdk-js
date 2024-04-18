import { BillingAddress, PaymentMethod } from '@bigcommerce/checkout-sdk/payment-integration-api';

export function getBillingAddress(): BillingAddress {
    return {
        id: '55c96cda6f04c',
        firstName: 'Test',
        lastName: 'Tester',
        email: 'test@bigcommerce.com',
        company: 'Bigcommerce',
        address1: '12345 Testing Way',
        address2: '',
        city: 'Some City',
        stateOrProvince: 'Oxford',
        stateOrProvinceCode: 'CA',
        country: 'United Kingdom',
        countryCode: 'GB',
        postalCode: '95555',
        phone: '555-555-5555',
        customFields: [],
    };
}

export function getClearpay(): PaymentMethod {
    return {
        id: 'PAY_BY_INSTALLMENT',
        gateway: 'clearpay',
        logoUrl: '',
        method: 'multi-option',
        supportedCards: [],
        config: {
            displayName: 'Pay over time',
            merchantId: '33133',
            testMode: false,
        },
        type: 'PAYMENT_TYPE_API',
        clientToken: 'foo',
    };
}
