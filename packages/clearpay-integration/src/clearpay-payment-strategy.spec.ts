import { Action, createAction, createErrorAction } from '@bigcommerce/data-store';
import { createScriptLoader } from '@bigcommerce/script-loader';
import { merge, noop } from 'lodash';
import { Observable, of } from 'rxjs';

import {
    createCheckoutStore,
} from '../../../checkout';
import {
    getCheckout,
    getCheckoutPayment,
    getCheckoutStoreState,
} from '../../../checkout/checkouts.mock';
import { getErrorResponse } from '../../../common/http-request/responses.mock';
import {
    StoreCreditActionType,
} from '../../../store-credit';
import { PaymentMethodActionType } from '../../payment-method-actions';

import ClearpayPaymentStrategy from './clearpay-payment-strategy';
import ClearpayScriptLoader from './clearpay-script-loader';
import { getBillingAddress, getClearpay } from './clearpay.mock';
import {
    getErrorPaymentResponseBody,
    getOrderRequestBody,
    getResponse,
    PaymentIntegrationServiceMock,
} from '@bigcommerce/checkout-sdk/payment-integrations-test-utils';
import {
    InvalidArgumentError,
    MissingDataError,
    NotInitializedError,
    OrderActionType,
    OrderFinalizationNotCompletedError,
    OrderRequestBody,
    PaymentActionType,
    PaymentIntegrationService,
    PaymentMethod,
    RequestError,
} from '@bigcommerce/checkout-sdk/payment-integration-api';

describe('ClearpayPaymentStrategy', () => {
    let loadPaymentMethodAction: Observable<Action>;
    let payload: OrderRequestBody;
    let paymentIntegrationService: PaymentIntegrationService;
    let paymentMethod: PaymentMethod;
    let scriptLoader: ClearpayScriptLoader;
    let submitOrderAction: Observable<Action>;
    let submitPaymentAction: Observable<Action>;
    let strategy: ClearpayPaymentStrategy;

    const clearpaySdk = {
        initialize: noop,
        redirect: noop,
    };

    beforeEach(() => {
        store = createCheckoutStore({
            ...getCheckoutStoreState(),
            billingAddress: { data: getBillingAddress(), errors: {}, statuses: {} },
        });
        paymentIntegrationService = new PaymentIntegrationServiceMock();
        scriptLoader = new ClearpayScriptLoader(createScriptLoader());
        strategy = new ClearpayPaymentStrategy(
            paymentIntegrationService,
            scriptLoader,
        );

        paymentMethod = getClearpay();

        payload = merge({}, getOrderRequestBody(), {
            payment: {
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            },
        });

        loadPaymentMethodAction = of(
            createAction(
                PaymentMethodActionType.LoadPaymentMethodSucceeded,
                { ...paymentMethod, id: 'clearpay' },
                { methodId: paymentMethod.gateway },
            ),
        );

        submitOrderAction = of(createAction(OrderActionType.SubmitOrderRequested));
        submitPaymentAction = of(createAction(PaymentActionType.SubmitPaymentRequested));

        payload = merge({}, getOrderRequestBody(), {
            payment: {
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            },
        });

        jest.spyOn(paymentIntegrationService, 'validateCheckout').mockReturnValue(
            new Promise<void>((resolve) => resolve()),
        );

        jest.spyOn(paymentIntegrationService, 'submitOrder').mockReturnValue(submitOrderAction);

        jest.spyOn(paymentIntegrationService, 'loadPaymentMethod').mockReturnValue(
            loadPaymentMethodAction,
        );

        jest.spyOn(paymentIntegrationService, 'applyStoreCredit').mockReturnValue(
            of(createAction(StoreCreditActionType.ApplyStoreCreditSucceeded)),
        );

        jest.spyOn(paymentIntegrationService, 'submitPayment').mockReturnValue(submitPaymentAction);

        jest.spyOn(scriptLoader, 'load').mockReturnValue(Promise.resolve(clearpaySdk));

        jest.spyOn(clearpaySdk, 'initialize').mockImplementation(noop);

        jest.spyOn(clearpaySdk, 'redirect').mockImplementation(noop);
    });

    describe('#initialize()', () => {
        it('loads script when initializing strategy', async () => {
            await strategy.initialize({
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            });

            expect(scriptLoader.load).toHaveBeenCalledWith(paymentMethod);
        });
    });

    describe('#execute()', () => {
        const successHandler = jest.fn();

        beforeEach(async () => {
            await strategy.initialize({
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            });

            strategy.execute(payload).then(successHandler);

            await new Promise((resolve) => process.nextTick(resolve));
        });

        it('redirects to Clearpay', () => {
            expect(clearpaySdk.initialize).toHaveBeenCalledWith({ countryCode: 'GB' });
            expect(clearpaySdk.redirect).toHaveBeenCalledWith({ token: paymentMethod.clientToken });
        });

        it('applies store credit usage', () => {
            expect(paymentIntegrationService.applyStoreCredit).toHaveBeenCalledWith(false);
        });

        it('validates nothing has changed before redirecting to Clearpay checkout page', () => {
            expect(paymentIntegrationService.validateCheckout).toHaveBeenCalled();
        });

        it('rejects with error if execution is unsuccessful', async () => {
            jest.spyOn(paymentIntegrationService, 'applyStoreCredit').mockReturnValue(
                of(createErrorAction(StoreCreditActionType.ApplyStoreCreditFailed, new Error())),
            );

            const errorHandler = jest.fn();

            strategy.execute(payload).catch(errorHandler);

            await new Promise((resolve) => process.nextTick(resolve));

            expect(errorHandler).toHaveBeenCalled();
        });

        it('throws error if trying to execute before initialization', async () => {
            await strategy.deinitialize();

            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(NotInitializedError);
            }
        });

        it('throws InvalidArgumentError if loadPaymentMethod fails', async () => {
            const errorResponse = merge(getErrorResponse(), {
                body: {
                    status: 422,
                },
            });

            jest.spyOn(paymentIntegrationService, 'loadPaymentMethod').mockImplementation(() => {
                throw new RequestError(errorResponse);
            });

            await expect(strategy.execute(payload)).rejects.toThrow(InvalidArgumentError);
        });

        it('throws RequestError if loadPaymentMethod fails', async () => {
            jest.spyOn(paymentIntegrationService, 'loadPaymentMethod').mockImplementation(() => {
                throw new RequestError(getErrorResponse());
            });

            await expect(strategy.execute(payload)).rejects.toThrow(RequestError);
        });

        it('loads payment client token', () => {
            expect(paymentIntegrationService.loadPaymentMethod).toHaveBeenCalledWith(
                paymentMethod.gateway,
                { params: { method: paymentMethod.id } },
            );
        });

        it("throws error if GB isn't the courtryCode in the billing address", async () => {
            await strategy.deinitialize();

            store = createCheckoutStore({
                ...getCheckoutStoreState(),
                billingAddress: {
                    data: { ...getBillingAddress(), countryCode: '' },
                    errors: {},
                    statuses: {},
                },
            });
            strategy = new ClearpayPaymentStrategy(
                paymentIntegrationService,
                scriptLoader,
            );

            await expect(strategy.execute(payload)).rejects.toThrow(InvalidArgumentError);
        });
    });

    describe('#finalize()', () => {
        const nonce = 'bar';

        beforeEach(() => {
            store = createCheckoutStore(
                merge({}, getCheckoutStoreState(), {
                    config: {
                        data: {
                            context: { payment: { token: nonce } },
                        },
                    },
                    checkout: {
                        data: {
                            ...getCheckout(),
                            payments: [
                                {
                                    ...getCheckoutPayment(),
                                    providerId: paymentMethod.id,
                                    gatewayId: paymentMethod.gateway,
                                },
                            ],
                        },
                    },
                    order: {},
                }),
            );

            strategy = new ClearpayPaymentStrategy(
                paymentIntegrationService,
                scriptLoader,
            );
        });

        it('submits the order and the payment', async () => {
            await strategy.initialize({
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            });
            await strategy.finalize({
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            });

            expect(paymentIntegrationService.submitOrder).toHaveBeenCalledWith(
                {},
                { methodId: paymentMethod.id, gatewayId: paymentMethod.gateway },
            );

            expect(paymentIntegrationService.submitPayment).toHaveBeenCalledWith({
                methodId: paymentMethod.id,
                paymentData: { nonce },
            });

            jest.spyOn(paymentIntegrationService, 'forgetCheckout');

            expect(paymentIntegrationService.forgetCheckout).not.toHaveBeenCalled();
        });

        it('throws error if unable to finalize order due to missing data', async () => {
            store = createCheckoutStore(getCheckoutStoreState());
            strategy = new ClearpayPaymentStrategy(
                paymentIntegrationService,
                scriptLoader,
            );

            await expect(
                strategy.finalize({ methodId: paymentMethod.id, gatewayId: paymentMethod.gateway }),
            ).rejects.toThrow(MissingDataError);
        });

        it('throws OrderFinalizationNotCompleted error if unable to finalize order', async () => {
            const response = new RequestError(getResponse(getErrorPaymentResponseBody()));
            const paymentFailedErrorAction = of(
                createErrorAction(PaymentActionType.SubmitPaymentFailed, response),
            );

            jest.spyOn(paymentIntegrationService, 'submitPayment').mockReturnValue(
                paymentFailedErrorAction,
            );
            jest.spyOn(paymentIntegrationService, 'forgetCheckout').mockReturnValue(
                Promise.resolve(),
            );
            jest.spyOn(paymentIntegrationService, 'loadPaymentMethods').mockReturnValue(
                of(
                    createAction(PaymentMethodActionType.LoadPaymentMethodsSucceeded, [
                        getClearpay(),
                    ]),
                ),
            );

            await strategy.initialize({
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            });

            await expect(
                strategy.finalize({ methodId: paymentMethod.id, gatewayId: paymentMethod.gateway }),
            ).rejects.toThrow(OrderFinalizationNotCompletedError);

            expect(paymentIntegrationService.forgetCheckout).toHaveBeenCalled();
            expect(paymentIntegrationService.loadPaymentMethods).toHaveBeenCalled();
        });
    });
});
