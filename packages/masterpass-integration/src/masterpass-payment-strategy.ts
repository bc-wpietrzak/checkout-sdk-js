import {
    InvalidArgumentError,
    MissingDataError,
    MissingDataErrorType,
    OrderFinalizationNotRequiredError,
    OrderRequestBody,
    PaymentInitializeOptions,
    PaymentIntegrationService,
    PaymentMethod,
    PaymentRequestOptions,
    PaymentStrategy,
} from '@bigcommerce/checkout-sdk/payment-integration-api';

import formatLocale from './format-locale';
import getCallbackUrl from './get-callback-url';
import { Masterpass, MasterpassCheckoutOptions } from './masterpass';
import { WithMasterpassPaymentInitializeOptions } from './masterpass-payment-initialize-options';
import MasterpassScriptLoader from './masterpass-script-loader';

export default class MasterpassPaymentStrategy implements PaymentStrategy {
    private _masterpassClient?: Masterpass;
    private _paymentMethod?: PaymentMethod;
    private _walletButton?: HTMLElement;

    constructor(
        private _paymentIntegrationService: PaymentIntegrationService,
        private _masterpassScriptLoader: MasterpassScriptLoader,
        private _locale: string,
    ) {}

    initialize(
        options: PaymentInitializeOptions & WithMasterpassPaymentInitializeOptions,
    ): Promise<void> {
        const { methodId } = options;

        this._paymentMethod = this._paymentIntegrationService.getState().getPaymentMethod(methodId);

        if (!this._paymentMethod) {
            throw new MissingDataError(MissingDataErrorType.MissingPaymentMethod);
        }

        const masterpassScriptLoaderParams = {
            useMasterpassSrc: this._paymentMethod.initializationData.isMasterpassSrcEnabled,
            language: formatLocale(this._locale),
            testMode: this._paymentMethod.config.testMode,
            checkoutId: this._paymentMethod.initializationData.checkoutId,
        };

        return this._masterpassScriptLoader
            .load(masterpassScriptLoaderParams)
            .then((masterpass) => {
                this._masterpassClient = masterpass;

                if (!options.masterpass) {
                    throw new InvalidArgumentError(
                        'Unable to initialize payment because "options.masterpass" argument is not provided.',
                    );
                }

                const walletButton =
                    options.masterpass.walletButton &&
                    document.getElementById(options.masterpass.walletButton);

                if (walletButton) {
                    this._walletButton = walletButton;
                    this._walletButton.addEventListener('click', this._handleWalletButtonClick);
                }
            });
    }

    deinitialize(): Promise<void> {
        this._paymentMethod = undefined;

        if (this._walletButton) {
            this._walletButton.removeEventListener('click', this._handleWalletButtonClick);
        }

        this._walletButton = undefined;
        this._masterpassClient = undefined;

        return Promise.resolve();
    }

    async execute(payload: OrderRequestBody, options?: PaymentRequestOptions): Promise<void> {
        const { payment } = payload;
        const order = { useStoreCredit: payload.useStoreCredit };

        if (!payment) {
            throw new InvalidArgumentError(
                'Unable to submit payment because "payload.payment" argument is not provided.',
            );
        }

        if (
            !this._paymentMethod ||
            !this._paymentMethod.initializationData ||
            !this._paymentMethod.initializationData?.gateway
        ) {
            throw new MissingDataError(MissingDataErrorType.MissingPaymentMethod);
        }

        // TODO: Refactor the API endpoint to return nonce in the right place.
        const paymentData = this._paymentMethod.initializationData.paymentData;

        // TODO: Redirect to Masterpass if nonce has not been generated yet. And then finalise the order when the shopper is redirected back to the checkout page.
        if (!paymentData) {
            throw new InvalidArgumentError(
                'Unable to proceed because "paymentMethod.initializationData.paymentData" argument is not provided.',
            );
        }

        await this._paymentIntegrationService.submitOrder(order, options);
        await this._paymentIntegrationService.submitPayment({ ...payment, paymentData });
    }

    finalize(): Promise<void> {
        return Promise.reject(new OrderFinalizationNotRequiredError());
    }

    private _createMasterpassPayload(): MasterpassCheckoutOptions {
        const state = this._paymentIntegrationService.getState();
        const checkout = state.getCheckout();
        const storeConfig = state.getStoreConfig();

        if (!checkout) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckout);
        }

        if (!storeConfig) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckoutConfig);
        }

        if (!this._paymentMethod || !this._paymentMethod.initializationData) {
            throw new MissingDataError(MissingDataErrorType.MissingPaymentMethod);
        }

        return {
            checkoutId: this._paymentMethod.initializationData.checkoutId,
            allowedCardTypes: this._paymentMethod.initializationData.allowedCardTypes,
            amount: checkout.subtotal.toFixed(2),
            currency: storeConfig.currency.code,
            cartId: checkout.cart.id,
            callbackUrl: getCallbackUrl('checkout'),
        };
    }

    // @bind
    private _handleWalletButtonClick(event: Event) {
        event.preventDefault();

        if (!this._masterpassClient) {
            return;
        }

        const payload = this._createMasterpassPayload();

        this._masterpassClient.checkout(payload);
    }
}
