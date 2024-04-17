import { createAction, createErrorAction } from '@bigcommerce/data-store';
import { createFormPoster, FormPoster } from '@bigcommerce/form-poster';
import { noop, omit } from 'lodash';
import { Observable, of } from 'rxjs';

import {
    CheckoutStore,
    createCheckoutStore,
} from '../../core/src/checkout';
import { getCheckoutStoreState } from '../../core/src/checkout/checkouts.mock';
import { RequestError } from '../../core/src/common/error/errors';
import { getResponse } from '../../core/src/common/http-request/responses.mock';
import { HostedFormFactory } from '../../core/src/hosted-form';
import {
    FinalizeOrderAction,
    OrderActionCreator,
    OrderActionType,
    SubmitOrderAction,
} from '../../core/src/order';
import { OrderFinalizationNotRequiredError } from '../../core/src/order/errors';
import { getOrderRequestBody } from '../../core/src/order/internal-orders.mock';
import { getOrder } from '../../core/src/order/orders.mock';
import PaymentActionCreator from '../../core/src/payment/payment-action-creator';
import { PaymentActionType, SubmitPaymentAction } from '../../core/src/payment/payment-actions';
import * as paymentStatusTypes from '../../core/src/payment/payment-status-types';
import { getErrorPaymentResponseBody } from '../../core/src/payment/payments.mock';
import { CreditCardPaymentStrategy } from '../../core/src/payment/strategies/credit-card';

import ConvergePaymentStrategy from './converge-payment-strategy';
import { PaymentIntegrationServiceMock } from '@bigcommerce/checkout-sdk/payment-integrations-test-utils';
import { PaymentIntegrationService } from '@bigcommerce/checkout-sdk/payment-integration-api';

describe('ConvergePaymentStrategy', () => {
    let finalizeOrderAction: Observable<FinalizeOrderAction>;
    let formPoster: FormPoster;
    let hostedFormFactory: HostedFormFactory;
    let orderActionCreator: OrderActionCreator;
    let paymentActionCreator: PaymentActionCreator;
    let paymentIntegrationService: PaymentIntegrationService;
    let store: CheckoutStore;
    let strategy: ConvergePaymentStrategy;
    let submitOrderAction: Observable<SubmitOrderAction>;
    let submitPaymentAction: Observable<SubmitPaymentAction>;

    beforeEach(() => {
        paymentIntegrationService = new PaymentIntegrationServiceMock();

        formPoster = createFormPoster();
        store = createCheckoutStore(getCheckoutStoreState());
        hostedFormFactory = {} as HostedFormFactory;

        finalizeOrderAction = of(createAction(OrderActionType.FinalizeOrderRequested));
        submitOrderAction = of(createAction(OrderActionType.SubmitOrderRequested));
        submitPaymentAction = of(createAction(PaymentActionType.SubmitPaymentRequested));

        jest.spyOn(store, 'dispatch');

        jest.spyOn(formPoster, 'postForm').mockImplementation((_url, _data, callback = noop) =>
            callback(),
        );

        jest.spyOn(orderActionCreator, 'finalizeOrder').mockReturnValue(finalizeOrderAction);

        jest.spyOn(orderActionCreator, 'submitOrder').mockReturnValue(submitOrderAction);

        jest.spyOn(paymentActionCreator, 'submitPayment').mockReturnValue(submitPaymentAction);

        strategy = new ConvergePaymentStrategy(
            paymentIntegrationService,
            formPoster,
        );
    });

    it('submits order without payment data', async () => {
        const payload = getOrderRequestBody();
        const options = { methodId: 'converge' };

        await strategy.execute(payload, options);

        expect(orderActionCreator.submitOrder).toHaveBeenCalledWith(
            omit(payload, 'payment'),
            options,
        );
        expect(store.dispatch).toHaveBeenCalledWith(submitOrderAction);
    });

    it('submits payment separately', async () => {
        const payload = getOrderRequestBody();
        const options = { methodId: 'converge' };

        await strategy.execute(payload, options);

        expect(paymentActionCreator.submitPayment).toHaveBeenCalledWith(payload.payment);
        expect(store.dispatch).toHaveBeenCalledWith(submitPaymentAction);
    });

    it('returns checkout state', async () => {
        const output = await strategy.execute(getOrderRequestBody());

        expect(output).toEqual(store.getState());
    });

    it('posts 3ds data to Converge if 3ds is enabled', async () => {
        const error = new RequestError(
            getResponse({
                ...getErrorPaymentResponseBody(),
                errors: [{ code: 'three_d_secure_required' }],
                three_ds_result: {
                    acs_url: 'https://acs/url',
                    callback_url: 'https://callback/url',
                    payer_auth_request: 'payer_auth_request',
                    merchant_data: 'merchant_data',
                },
                status: 'error',
            }),
        );

        jest.spyOn(paymentActionCreator, 'submitPayment').mockReturnValue(
            of(createErrorAction(PaymentActionType.SubmitPaymentFailed, error)),
        );

        strategy.execute(getOrderRequestBody());

        await new Promise((resolve) => process.nextTick(resolve));

        expect(formPoster.postForm).toHaveBeenCalledWith('https://acs/url', {
            PaReq: 'payer_auth_request',
            TermUrl: 'https://callback/url',
            MD: 'merchant_data',
        });
    });

    it('does not post 3ds data to Converge if 3ds is not enabled', async () => {
        const response = new RequestError(getResponse(getErrorPaymentResponseBody()));

        jest.spyOn(paymentActionCreator, 'submitPayment').mockReturnValue(
            of(createErrorAction(PaymentActionType.SubmitPaymentFailed, response)),
        );

        try {
            await strategy.execute(getOrderRequestBody());
        } catch (error) {
            expect(error).toBeInstanceOf(RequestError);
            expect(formPoster.postForm).not.toHaveBeenCalled();
        }
    });

    it('finalizes order if order is created and payment is finalized', async () => {
        const state = store.getState();

        jest.spyOn(state.order, 'getOrder').mockReturnValue(getOrder());

        jest.spyOn(state.payment, 'getPaymentStatus').mockReturnValue(paymentStatusTypes.FINALIZE);

        await strategy.finalize();

        expect(orderActionCreator.finalizeOrder).toHaveBeenCalled();
        expect(store.dispatch).toHaveBeenCalledWith(finalizeOrderAction);
    });

    it('does not finalize order if order is not created', async () => {
        const state = store.getState();

        jest.spyOn(state.order, 'getOrder').mockReturnValue(null);

        try {
            await strategy.finalize();
        } catch (error) {
            expect(orderActionCreator.finalizeOrder).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalledWith(finalizeOrderAction);
            expect(error).toBeInstanceOf(OrderFinalizationNotRequiredError);
        }
    });

    it('does not finalize order if order is not finalized', async () => {
        const state = store.getState();

        jest.spyOn(state.payment, 'getPaymentStatus').mockReturnValue(
            paymentStatusTypes.INITIALIZE,
        );

        try {
            await strategy.finalize();
        } catch (error) {
            expect(orderActionCreator.finalizeOrder).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalledWith(finalizeOrderAction);
            expect(error).toBeInstanceOf(OrderFinalizationNotRequiredError);
        }
    });

    it('throws error if order is missing', async () => {
        const state = store.getState();

        jest.spyOn(state.order, 'getOrder').mockReturnValue(null);

        try {
            await strategy.finalize();
        } catch (error) {
            expect(error).toBeInstanceOf(OrderFinalizationNotRequiredError);
        }
    });

    it('is special type of credit card strategy', () => {
        expect(strategy).toBeInstanceOf(CreditCardPaymentStrategy);
    });
});
