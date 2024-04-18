import { createScriptLoader } from '@bigcommerce/script-loader';

import {
    PaymentStrategyFactory,
    toResolvableModule,
} from '@bigcommerce/checkout-sdk/payment-integration-api';

import ClearpayPaymentStrategy from './clearpay-payment-strategy';
import ClearpayScriptLoader from './clearpay-script-loader';

const createClearpayPaymentStrategy: PaymentStrategyFactory<ClearpayPaymentStrategy> = (
    paymentIntegrationService,
) => {
    return new ClearpayPaymentStrategy(
        paymentIntegrationService,
        new ClearpayScriptLoader(createScriptLoader()),
    );
};

export default toResolvableModule(createClearpayPaymentStrategy, [
    { gateway: 'clearpay' },
    { id: 'clearpay' },
]);
