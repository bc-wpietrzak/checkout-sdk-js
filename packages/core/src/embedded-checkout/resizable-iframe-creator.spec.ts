import { EventEmitter } from 'events';

import { IFrameComponent, IFrameObject, IFrameOptions, iframeResizer } from '../common/iframe';

import { EmbeddedCheckoutEventType } from './embedded-checkout-events';
import { NotEmbeddableError } from './errors';
import ResizableIframeCreator, { ExtendedHTMLIFrameElement } from './resizable-iframe-creator';

jest.mock('../common/iframe', () => ({
    iframeResizer: jest.fn((_: IFrameOptions, element: HTMLIFrameElement) => {
        (element as IFrameComponent).iFrameResizer = {} as IFrameObject;

        return [element];
    }),
    isIframeEvent: jest.fn((object, type) => object.type === type),
}));

describe('ResizableIframeCreator', () => {
    let url: string;
    let container: HTMLElement;
    let eventEmitter: EventEmitter;
    let iframeCreator: ResizableIframeCreator;

    beforeEach(() => {
        url = 'http://mybigcommerce.com/checkout';
        container = document.createElement('div');
        eventEmitter = new EventEmitter();

        jest.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
            // TODO: remove ts-ignore and update test with related type (PAYPAL-4383)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            return eventEmitter.addListener(type, listener);
        });

        jest.spyOn(window, 'removeEventListener').mockImplementation((type, listener) => {
            // TODO: remove ts-ignore and update test with related type (PAYPAL-4383)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            return eventEmitter.removeListener(type, listener);
        });

        container.setAttribute('id', 'checkout');
        window.document.body.appendChild(container);

        iframeCreator = new ResizableIframeCreator({
            timeout: 0,
        });
    });

    it('inserts checkout iframe into container', async () => {
        setTimeout(() => {
            eventEmitter.emit('message', {
                origin: 'http://mybigcommerce.com',
                data: { type: EmbeddedCheckoutEventType.FrameLoaded },
            });
        });

        const frame = await iframeCreator.createFrame(url, 'checkout');

        expect(frame.tagName).toBe('IFRAME');
        expect(frame.src).toEqual(url);
        expect(frame.parentElement).toEqual(container);
    });

    it('configures iframe to be borderless and auto-resizable', async () => {
        setTimeout(() => {
            eventEmitter.emit('message', {
                origin: 'http://mybigcommerce.com',
                data: { type: EmbeddedCheckoutEventType.FrameLoaded },
            });
        });

        const frame = await iframeCreator.createFrame(url, 'checkout');

        expect(frame.style.border).toBe('');
        expect(frame.style.width).toBe('100%');
        expect(frame.iFrameResizer).toBeDefined();
        expect(iframeResizer).toHaveBeenCalledWith(
            {
                scrolling: false,
                sizeWidth: false,
                heightCalculationMethod: 'lowestElement',
            },
            frame,
        );
    });

    it('calculates iframe height based on body element if option is passed', async () => {
        setTimeout(() => {
            eventEmitter.emit('message', {
                origin: 'http://mybigcommerce.com',
                data: {
                    type: EmbeddedCheckoutEventType.FrameLoaded,
                    payload: { contentId: 'foobar' },
                },
            });
        });

        await iframeCreator.createFrame(url, 'checkout');

        expect(iframeResizer).toHaveBeenCalledWith(
            expect.objectContaining({
                heightCalculationMethod: 'taggedElement',
            }),
            expect.any(HTMLIFrameElement),
        );
    });

    it('allows cross-origin iframe to use payment request API', async () => {
        setTimeout(() => {
            eventEmitter.emit('message', {
                origin: 'http://mybigcommerce.com',
                data: { type: EmbeddedCheckoutEventType.FrameLoaded },
            });
        });

        const frame: ExtendedHTMLIFrameElement = await iframeCreator.createFrame(url, 'checkout');

        expect(frame.allowPaymentRequest).toBe(true);
    });

    it('removes message listener if iframe is loaded successfully', async () => {
        jest.spyOn(window, 'removeEventListener');

        setTimeout(() => {
            eventEmitter.emit('message', {
                origin: 'http://mybigcommerce.com',
                data: { type: EmbeddedCheckoutEventType.FrameLoaded },
            });
        });

        await iframeCreator.createFrame(url, 'checkout');

        expect(window.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('throws error if unable to find container element', () => {
        expect(() => iframeCreator.createFrame(url, 'invalid_container')).toThrow(
            NotEmbeddableError,
        );
    });

    it('throws error if not receiving "loaded" event within certain timeframe', async () => {
        try {
            await iframeCreator.createFrame(url, 'checkout');
        } catch (error) {
            expect(error).toBeInstanceOf(NotEmbeddableError);
        }
    });

    it('throws error if receiving "error" event from iframe', async () => {
        const event = {
            type: EmbeddedCheckoutEventType.FrameError,
            payload: { message: 'Not available' },
        };

        setTimeout(() => {
            eventEmitter.emit('message', {
                origin: 'http://mybigcommerce.com',
                data: event,
            });
        });

        try {
            await iframeCreator.createFrame(url, 'checkout');
        } catch (error) {
            expect(error).toBeInstanceOf(NotEmbeddableError);
            expect((error as NotEmbeddableError).message).toEqual(event.payload.message);
        }
    });

    it('removes iframe from container element if unable to load', async () => {
        try {
            await iframeCreator.createFrame(url, 'checkout');
        } catch (error) {
            expect(container.childNodes).toHaveLength(0);
        }
    });

    it('removes message listener if unable to load', async () => {
        jest.spyOn(window, 'removeEventListener');

        try {
            await iframeCreator.createFrame(url, 'checkout');
        } catch (error) {
            expect(window.removeEventListener).toHaveBeenCalledWith(
                'message',
                expect.any(Function),
            );
        }
    });

    it('inserts the iframe even if the message comes from the www version of the url', async () => {
        setTimeout(() => {
            eventEmitter.emit('message', {
                origin: 'http://www.mybigcommerce.com',
                data: { type: EmbeddedCheckoutEventType.FrameLoaded },
            });
        });

        const frame = await iframeCreator.createFrame(url, 'checkout');

        expect(frame.tagName).toBe('IFRAME');
        expect(frame.src).toEqual(url);
    });
});
