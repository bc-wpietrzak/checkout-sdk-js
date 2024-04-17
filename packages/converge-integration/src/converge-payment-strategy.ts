import { FormPoster } from '@bigcommerce/form-poster';
import { some } from 'lodash';
import {
    OrderFinalizationNotRequiredError,
    OrderRequestBody,
    PaymentIntegrationService,
    PaymentRequestOptions,
    PaymentStatusTypes,
    RequestError,
} from '@bigcommerce/checkout-sdk/payment-integration-api';
import { CreditCardPaymentStrategy } from '@bigcommerce/checkout-sdk/credit-card-integration';

export default class ConvergePaymentStrategy extends CreditCardPaymentStrategy {
    constructor(
        private paymentIntegrationService: PaymentIntegrationService,
        private formPoster: FormPoster,
    ) {
        super(paymentIntegrationService);
    }

    execute(
        payload: OrderRequestBody,
        options?: PaymentRequestOptions,
    ): Promise<void> {
        return super.execute(payload, options).catch((error) => {
            if (
                !(error instanceof RequestError) ||
                !some(error.body.errors, { code: 'three_d_secure_required' })
            ) {
                return Promise.reject(error);
            }

            return new Promise(() => {
                this.formPoster.postForm(error.body.three_ds_result.acs_url, {
                    PaReq: error.body.three_ds_result.payer_auth_request,
                    TermUrl: error.body.three_ds_result.callback_url,
                    MD: error.body.three_ds_result.merchant_data,
                });
            });
        });
    }

    finalize(options?: PaymentRequestOptions): Promise<void> {
        const state = this.paymentIntegrationService.getState();
        const order = state.getOrder();

        if (order && state.getPaymentStatus() === PaymentStatusTypes.FINALIZE) {
            this.paymentIntegrationService.finalizeOrder(options);
        }

        return Promise.reject(new OrderFinalizationNotRequiredError());
    }
}
