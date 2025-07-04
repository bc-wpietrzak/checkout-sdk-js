import { createFormPoster, FormPoster } from '@bigcommerce/form-poster';
import { createRequestSender, RequestSender } from '@bigcommerce/request-sender';
import { getScriptLoader } from '@bigcommerce/script-loader';

import {
    BuyNowCartCreationError,
    Cart,
    Consignment,
    MissingDataError,
    PaymentIntegrationService,
    PaymentMethod,
    PaymentMethodClientUnavailableError,
    RequestError,
} from '@bigcommerce/checkout-sdk/payment-integration-api';
import {
    getBuyNowCart,
    getBuyNowCartRequestBody,
    getCart,
    getConsignment,
    getShippingOption,
    PaymentIntegrationServiceMock,
} from '@bigcommerce/checkout-sdk/payment-integrations-test-utils';

import BigCommercePaymentsIntegrationService from './bigcommerce-payments-integration-service';
import BigCommercePaymentsRequestSender from './bigcommerce-payments-request-sender';
import BigCommercePaymentsScriptLoader from './bigcommerce-payments-script-loader';
import {
    PayPalOrderStatus,
    PayPalSDK,
    StyleButtonColor,
    StyleButtonLabel,
    StyleButtonShape,
} from './bigcommerce-payments-types';
import {
    getBigCommercePaymentsOrderDetails,
    getBigCommercePaymentsPaymentMethod,
    getBillingAddressFromOrderDetails,
    getPayPalSDKMock,
    getShippingAddressFromOrderDetails,
} from './mocks';

describe('BigCommercePaymentsIntegrationService', () => {
    let buyNowCart: Cart;
    let cart: Cart;
    let consignments: Consignment[];
    let formPoster: FormPoster;
    let requestSender: RequestSender;
    let subject: BigCommercePaymentsIntegrationService;
    let paymentIntegrationService: PaymentIntegrationService;
    let paymentMethod: PaymentMethod;
    let bigCommercePaymentsRequestSender: BigCommercePaymentsRequestSender;
    let bigCommercePaymentsScriptLoader: BigCommercePaymentsScriptLoader;
    let paypalSdk: PayPalSDK;

    const defaultMethodId = 'bigcommerce_payments';
    const defaultGatewayId = 'bigcommerce_payments_apms';
    const mockedOrderId = 'order123';

    beforeEach(() => {
        buyNowCart = getBuyNowCart();
        cart = getCart();
        consignments = [getConsignment()];

        paymentMethod = getBigCommercePaymentsPaymentMethod();
        paypalSdk = getPayPalSDKMock();

        formPoster = createFormPoster();
        requestSender = createRequestSender();
        paymentIntegrationService = new PaymentIntegrationServiceMock();
        bigCommercePaymentsRequestSender = new BigCommercePaymentsRequestSender(requestSender);
        bigCommercePaymentsScriptLoader = new BigCommercePaymentsScriptLoader(getScriptLoader());

        subject = new BigCommercePaymentsIntegrationService(
            formPoster,
            paymentIntegrationService,
            bigCommercePaymentsRequestSender,
            bigCommercePaymentsScriptLoader,
        );

        const state = paymentIntegrationService.getState();

        jest.spyOn(state, 'getPaymentMethodOrThrow').mockReturnValue(paymentMethod);
        jest.spyOn(state, 'getCartOrThrow').mockReturnValue(cart);
        jest.spyOn(state, 'getConsignmentsOrThrow').mockReturnValue(consignments);

        jest.spyOn(bigCommercePaymentsScriptLoader, 'getPayPalSDK').mockResolvedValue(paypalSdk);
    });

    it('creates an instance of the BigCommercePaymentsIntegrationService class', () => {
        expect(subject).toBeInstanceOf(BigCommercePaymentsIntegrationService);
    });

    describe('#loadPayPalSdk', () => {
        it('loads paypal sdk', async () => {
            const output = await subject.loadPayPalSdk(defaultMethodId, undefined, false, false);

            expect(bigCommercePaymentsScriptLoader.getPayPalSDK).toHaveBeenCalledWith(
                paymentMethod,
                cart.currency.code,
                false,
                false,
            );
            expect(output).toBe(paypalSdk);
        });

        it('loads paypal sdk with provided currency code', async () => {
            const providedCurrencyCode = 'UAH';
            const output = await subject.loadPayPalSdk(
                defaultMethodId,
                providedCurrencyCode,
                false,
                false,
            );

            expect(bigCommercePaymentsScriptLoader.getPayPalSDK).toHaveBeenCalledWith(
                paymentMethod,
                providedCurrencyCode,
                false,
                false,
            );
            expect(output).toBe(paypalSdk);
        });
    });

    describe('#getPayPalSdkOrThrow', () => {
        it('returns paypal sdk if it was loaded earlier', async () => {
            await subject.loadPayPalSdk(defaultMethodId, undefined, false);

            const output = subject.getPayPalSdkOrThrow();

            expect(output).toBe(paypalSdk);
        });

        it('throws an error if paypal sdk is not defined', () => {
            try {
                subject.getPayPalSdkOrThrow();
            } catch (error) {
                expect(error).toBeInstanceOf(PaymentMethodClientUnavailableError);
            }
        });
    });

    describe('#createBuyNowCartOrThrow', () => {
        it('throws an error there is no cart request body by calling callback from buyNowInitializeOptions', async () => {
            const buyNowInitializeOptionsMock = {
                getBuyNowCartRequestBody: jest.fn(),
            };

            try {
                await subject.createBuyNowCartOrThrow(buyNowInitializeOptionsMock);
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });

        it('successfully creates buy now cart', async () => {
            jest.spyOn(paymentIntegrationService, 'createBuyNowCart').mockResolvedValue(buyNowCart);

            const output = await subject.createBuyNowCartOrThrow({
                getBuyNowCartRequestBody,
            });

            expect(output).toBe(buyNowCart);
        });

        it('throws an error if there is something went wrong during buy now cart creation process', async () => {
            jest.spyOn(paymentIntegrationService, 'createBuyNowCart').mockImplementation(() =>
                Promise.reject(new Error()),
            );

            try {
                await subject.createBuyNowCartOrThrow({
                    getBuyNowCartRequestBody,
                });
            } catch (error) {
                expect(error).toBeInstanceOf(BuyNowCartCreationError);
            }
        });
    });

    describe('#createOrder', () => {
        it('successfully creates paypal order', async () => {
            jest.spyOn(bigCommercePaymentsRequestSender, 'createOrder').mockResolvedValue({
                orderId: mockedOrderId,
                approveUrl: 'url.com',
            });

            const output = await subject.createOrder(defaultMethodId);

            expect(bigCommercePaymentsRequestSender.createOrder).toHaveBeenCalledWith(
                defaultMethodId,
                {
                    cartId: cart.id,
                },
            );
            expect(output).toBe(mockedOrderId);
        });

        it('successfully creates paypal order with provided instrument data', async () => {
            jest.spyOn(bigCommercePaymentsRequestSender, 'createOrder').mockResolvedValue({
                orderId: mockedOrderId,
                approveUrl: 'url.com',
            });

            const vaultedInstrumentData = { instrumentId: 'vaultedInstrumentIdMock' };

            const output = await subject.createOrder(defaultMethodId, vaultedInstrumentData);

            expect(bigCommercePaymentsRequestSender.createOrder).toHaveBeenCalledWith(
                defaultMethodId,
                {
                    cartId: cart.id,
                    instrumentId: vaultedInstrumentData.instrumentId,
                },
            );
            expect(output).toBe(mockedOrderId);
        });
    });

    describe('#updateOrder', () => {
        it('successfully updates order', async () => {
            jest.spyOn(bigCommercePaymentsRequestSender, 'updateOrder').mockResolvedValue({
                statusCode: 200,
            });

            await subject.updateOrder();

            expect(bigCommercePaymentsRequestSender.updateOrder).toHaveBeenCalledWith({
                availableShippingOptions: consignments[0].availableShippingOptions,
                cartId: cart.id,
                selectedShippingOption: consignments[0].selectedShippingOption,
            });
        });

        it('throws an error if something went wrong during order update process', async () => {
            jest.spyOn(bigCommercePaymentsRequestSender, 'updateOrder').mockImplementation(() =>
                Promise.reject(new Error()),
            );

            try {
                await subject.updateOrder();
            } catch (error) {
                expect(error).toBeInstanceOf(RequestError);
            }
        });
    });

    describe('#getOrderStatus', () => {
        it('successfully updates order', async () => {
            jest.spyOn(bigCommercePaymentsRequestSender, 'getOrderStatus').mockResolvedValue({
                status: PayPalOrderStatus.Approved,
            });

            await subject.getOrderStatus();

            expect(bigCommercePaymentsRequestSender.getOrderStatus).toHaveBeenCalled();
        });

        it('calls getOrderStatus with proper data', async () => {
            jest.spyOn(bigCommercePaymentsRequestSender, 'getOrderStatus').mockResolvedValue({
                status: PayPalOrderStatus.Approved,
            });

            await subject.getOrderStatus('bigcommerce_payments_apms', {
                params: { useMetaData: true },
            });

            expect(bigCommercePaymentsRequestSender.getOrderStatus).toHaveBeenCalledWith(
                'bigcommerce_payments_apms',
                {
                    params: {
                        useMetaData: true,
                    },
                },
            );
        });

        it('throws an error if something went wrong during requesting order status', async () => {
            jest.spyOn(bigCommercePaymentsRequestSender, 'getOrderStatus').mockImplementation(() =>
                Promise.reject(new Error()),
            );

            try {
                await subject.getOrderStatus();
            } catch (error) {
                expect(error).toBeInstanceOf(RequestError);
            }
        });
    });

    describe('#tokenizePayment', () => {
        beforeEach(() => {
            jest.spyOn(formPoster, 'postForm').mockImplementation(jest.fn);
        });

        it('throws an error if order id is not provided', () => {
            try {
                subject.tokenizePayment(defaultMethodId);
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });

        it('successfully posts the form data', () => {
            subject.tokenizePayment(defaultMethodId, mockedOrderId);

            expect(formPoster.postForm).toHaveBeenCalledWith('/checkout.php', {
                payment_type: 'paypal',
                action: 'set_external_checkout',
                provider: defaultMethodId,
                order_id: mockedOrderId,
            });
        });

        it('successfully posts the form data with buy now cart id', () => {
            jest.spyOn(paymentIntegrationService.getState(), 'getCartOrThrow').mockReturnValue(
                buyNowCart,
            );

            subject.tokenizePayment(defaultMethodId, mockedOrderId);

            expect(formPoster.postForm).toHaveBeenCalledWith('/checkout.php', {
                payment_type: 'paypal',
                action: 'set_external_checkout',
                provider: defaultMethodId,
                order_id: mockedOrderId,
                cart_id: buyNowCart.id,
            });
        });
    });

    describe('#submitPayment', () => {
        it('successfully submits payment', async () => {
            jest.spyOn(paymentIntegrationService, 'submitPayment').mockImplementation(jest.fn());

            const paymentDataMock = {
                formattedPayload: {
                    vault_payment_instrument: null,
                    set_as_default_stored_instrument: null,
                    device_info: null,
                    method_id: defaultMethodId,
                    paypal_account: {
                        order_id: mockedOrderId,
                    },
                },
            };

            await subject.submitPayment(defaultMethodId, mockedOrderId);

            expect(paymentIntegrationService.submitPayment).toHaveBeenCalledWith({
                methodId: defaultMethodId,
                paymentData: paymentDataMock,
            });
        });

        it('successfully submits payment with provided gateway', async () => {
            jest.spyOn(paymentIntegrationService, 'submitPayment').mockImplementation(jest.fn());

            const paymentDataMock = {
                formattedPayload: {
                    vault_payment_instrument: null,
                    set_as_default_stored_instrument: null,
                    device_info: null,
                    method_id: defaultMethodId,
                    paypal_account: {
                        order_id: mockedOrderId,
                    },
                },
            };

            await subject.submitPayment(defaultMethodId, mockedOrderId, defaultGatewayId);

            expect(paymentIntegrationService.submitPayment).toHaveBeenCalledWith({
                methodId: defaultMethodId,
                paymentData: paymentDataMock,
                gatewayId: defaultGatewayId,
            });
        });
    });

    describe('#getShippingOptionOrThrow', () => {
        it('returns selected shipping option', () => {
            const consignment = getConsignment();

            jest.spyOn(
                paymentIntegrationService.getState(),
                'getConsignmentsOrThrow',
            ).mockReturnValue([consignment]);

            const output = subject.getShippingOptionOrThrow(consignment.selectedShippingOption?.id);

            expect(output).toStrictEqual(consignment.selectedShippingOption || {});
        });

        it('returns recommended shipping option if there is no selected ones', () => {
            const recommendedShippingOption = {
                ...getShippingOption(),
                isRecommended: true,
            };

            const consignment = {
                ...getConsignment(),
                availableShippingOptions: [recommendedShippingOption],
                selectedShippingOption: {
                    additionalDescription: 'string',
                    description: 'string',
                    id: 'string',
                    isRecommended: true,
                    imageUrl: 'string',
                    cost: 12,
                    transitTime: 'string',
                    type: 'string',
                },
            };

            const updatedConsignment = {
                ...consignment,
                selectedShippingOption: recommendedShippingOption,
            };

            jest.spyOn(paymentIntegrationService.getState(), 'getConsignmentsOrThrow')
                .mockReturnValueOnce([consignment])
                .mockReturnValue([updatedConsignment]);

            const output = subject.getShippingOptionOrThrow();

            expect(output).toBe(recommendedShippingOption);
        });

        it('returns first available shipping option if there is no recommended or selected options', () => {
            const firstShippingOption = {
                ...getShippingOption(),
                id: '1',
            };

            const secondShippingOption = {
                ...getShippingOption(),
                id: '2',
            };

            const consignment = {
                ...getConsignment(),
                availableShippingOptions: [firstShippingOption, secondShippingOption],
                selectedShippingOption: {
                    additionalDescription: 'string',
                    description: 'string',
                    id: '111',
                    isRecommended: true,
                    imageUrl: 'string',
                    cost: 12,
                    transitTime: 'string',
                    type: 'string',
                },
            };

            const updatedConsignment = {
                ...consignment,
                selectedShippingOption: firstShippingOption,
            };

            jest.spyOn(paymentIntegrationService.getState(), 'getConsignmentsOrThrow')
                .mockReturnValueOnce([consignment])
                .mockReturnValue([updatedConsignment]);

            const output = subject.getShippingOptionOrThrow();

            expect(output).toBe(firstShippingOption);
        });
    });

    describe('#getAddress', () => {
        it('successfully returns valid address', () => {
            const paypalOrderDetails = getBigCommercePaymentsOrderDetails();
            const address = {
                firstName: paypalOrderDetails.payer.name.given_name,
                lastName: paypalOrderDetails.payer.name.surname,
                email: paypalOrderDetails.payer.email_address,
                phone: '',
                company: '',
                address1: paypalOrderDetails.payer.address.address_line_1,
                address2: '',
                city: paypalOrderDetails.payer.address.admin_area_2,
                countryCode: paypalOrderDetails.payer.address.country_code,
                postalCode: paypalOrderDetails.payer.address.postal_code,
                stateOrProvince: '',
                stateOrProvinceCode: paypalOrderDetails.payer.address.admin_area_1,
                customFields: [],
            };

            const output = subject.getAddress(address);

            expect(output).toStrictEqual({
                firstName: paypalOrderDetails.payer.name.given_name,
                lastName: paypalOrderDetails.payer.name.surname,
                email: paypalOrderDetails.payer.email_address,
                phone: '',
                company: '',
                address1: paypalOrderDetails.payer.address.address_line_1,
                address2: '',
                city: paypalOrderDetails.payer.address.admin_area_2,
                countryCode: paypalOrderDetails.payer.address.country_code,
                postalCode: paypalOrderDetails.payer.address.postal_code,
                stateOrProvince: '',
                stateOrProvinceCode: paypalOrderDetails.payer.address.admin_area_1,
                customFields: [],
            });
        });

        it('successfully returns valid address with phone number filled in', () => {
            const paypalOrderDetails = getBigCommercePaymentsOrderDetails();
            const address = {
                firstName: paypalOrderDetails.payer.name.given_name,
                lastName: paypalOrderDetails.payer.name.surname,
                email: paypalOrderDetails.payer.email_address,
                phone: '555',
                company: '',
                address1: paypalOrderDetails.payer.address.address_line_1,
                address2: '',
                city: paypalOrderDetails.payer.address.admin_area_2,
                countryCode: paypalOrderDetails.payer.address.country_code,
                postalCode: paypalOrderDetails.payer.address.postal_code,
                stateOrProvince: '',
                stateOrProvinceCode: paypalOrderDetails.payer.address.admin_area_1,
                customFields: [],
            };

            const output = subject.getAddress(address);

            expect(output).toStrictEqual({
                firstName: paypalOrderDetails.payer.name.given_name,
                lastName: paypalOrderDetails.payer.name.surname,
                email: paypalOrderDetails.payer.email_address,
                phone: '555',
                company: '',
                address1: paypalOrderDetails.payer.address.address_line_1,
                address2: '',
                city: paypalOrderDetails.payer.address.admin_area_2,
                countryCode: paypalOrderDetails.payer.address.country_code,
                postalCode: paypalOrderDetails.payer.address.postal_code,
                stateOrProvince: '',
                stateOrProvinceCode: paypalOrderDetails.payer.address.admin_area_1,
                customFields: [],
            });
        });
    });

    describe('#getBillingAddressFromOrderDetails', () => {
        it('successfully returns valid billing address from the orderDetails data', () => {
            const paypalOrderDetails = getBigCommercePaymentsOrderDetails();

            const output = subject.getBillingAddressFromOrderDetails(paypalOrderDetails);

            expect(output).toStrictEqual(getBillingAddressFromOrderDetails());
        });

        it('successfully returns empty string in phone number', () => {
            const paypalOrderDetails = {
                ...getBigCommercePaymentsOrderDetails(),
                payer: {
                    ...getBigCommercePaymentsOrderDetails().payer,
                    phone: {
                        phone_number: {
                            national_number: '',
                        },
                    },
                },
            };

            const output = subject.getBillingAddressFromOrderDetails(paypalOrderDetails);

            expect(output.phone).toBe('');
        });

        it('successfully returns correct phone number', () => {
            const paypalOrderDetails = {
                ...getBigCommercePaymentsOrderDetails(),
                payer: {
                    ...getBigCommercePaymentsOrderDetails().payer,
                    phone: {
                        phone_number: {
                            national_number: '555333',
                        },
                    },
                },
            };

            const output = subject.getBillingAddressFromOrderDetails(paypalOrderDetails);

            expect(output.phone).toBe('555333');
        });
    });

    describe('#getShippingAddressFromOrderDetails', () => {
        it('successfully returns valid shipping address from the orderDetails data', () => {
            const paypalOrderDetails = getBigCommercePaymentsOrderDetails();

            const output = subject.getShippingAddressFromOrderDetails(paypalOrderDetails);

            expect(output).toStrictEqual(getShippingAddressFromOrderDetails());
        });
    });

    describe('#getValidButtonStyle', () => {
        it('returns valid button style', () => {
            const stylesMock = {
                color: StyleButtonColor.silver,
                height: 55,
                shape: StyleButtonShape.rect,
            };

            const expects = {
                ...stylesMock,
            };

            expect(subject.getValidButtonStyle(stylesMock)).toEqual(expects);
        });

        it('returns button style without shape if shape is not valid', () => {
            const stylesMock = {
                color: StyleButtonColor.silver,
                height: 55,
                shape: 'ellipse' as StyleButtonShape,
            };

            const expects = {
                ...stylesMock,
                shape: undefined,
            };

            expect(subject.getValidButtonStyle(stylesMock)).toEqual(expects);
        });

        it('returns button style without color if color is not valid', () => {
            const stylesMock = {
                color: 'red' as StyleButtonColor,
                height: 55,
            };

            const expects = {
                ...stylesMock,
                color: undefined,
            };

            expect(subject.getValidButtonStyle(stylesMock)).toEqual(expects);
        });

        it('returns button style without label if label is not valid', () => {
            const stylesMock = {
                height: 55,
                label: 'label' as StyleButtonLabel,
            };

            const expects = {
                ...stylesMock,
                label: undefined,
            };

            expect(subject.getValidButtonStyle(stylesMock)).toEqual(expects);
        });

        it('returns styles with updated height if height value is bigger than expected', () => {
            const stylesMock = {
                color: StyleButtonColor.silver,
                height: 110,
                shape: StyleButtonShape.rect,
            };

            const expects = {
                ...stylesMock,
                height: 55,
            };

            expect(subject.getValidButtonStyle(stylesMock)).toEqual(expects);
        });

        it('returns styles with updated height if height value is less than expected', () => {
            const stylesMock = {
                color: StyleButtonColor.silver,
                height: 10,
                shape: StyleButtonShape.rect,
            };

            const expects = {
                ...stylesMock,
                height: 25,
            };

            expect(subject.getValidButtonStyle(stylesMock)).toEqual(expects);
        });

        it('returns styles with default height if height value not provided', () => {
            const stylesMock = {
                color: StyleButtonColor.silver,
                height: undefined,
                shape: StyleButtonShape.rect,
            };

            const expects = {
                ...stylesMock,
                height: 40,
            };

            expect(subject.getValidButtonStyle(stylesMock)).toEqual(expects);
        });
    });

    describe('#removeElement', () => {
        it('removed element from dom', () => {
            const bigCommercePaymentsButtonContainerId = 'bigCommercePaymentsButtonContainer';

            const paypalButtonElement = document.createElement('div');

            paypalButtonElement.id = bigCommercePaymentsButtonContainerId;

            document.body.appendChild(paypalButtonElement);

            const element = document.getElementById(bigCommercePaymentsButtonContainerId);

            expect(element).toBeDefined();

            subject.removeElement(bigCommercePaymentsButtonContainerId);

            const computedStyle = getComputedStyle(element as Element);

            expect(computedStyle.getPropertyValue('display')).toBe('none');
        });
    });
});
