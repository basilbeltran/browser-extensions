import storage from '../../browser/storage'
import { updateExtensionSettings } from '../../shared/backend/extensions'

/**
 * Where a message originated from, used to disambiguate between the content
 * script's own messages and messages from the page.
 */
type Source = 'Page' | 'Client'

/**
 * Types of messages:
 *
 * - Ping is sent by either the page script or content script
 * - Edit is only sent by the page script
 * - SettingsUpdate is only sent by the content script
 */
type MessageType = 'Ping' | 'Edit' | 'SettingsUpdate'

export function injectSourcegraphApp(marker: HTMLElement): void {
    connectToPage()
        .then(listenForSettingsUpdates)
        .catch(error => console.error(error))

    if (document.getElementById(marker.id)) {
        return
    }

    window.addEventListener('load', () => {
        dispatchSourcegraphEvents(marker)
    })

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        dispatchSourcegraphEvents(marker)
    }
}

function dispatchSourcegraphEvents(marker: HTMLElement): void {
    // Generate and insert DOM element, in case this code executes first.
    document.body.appendChild(marker)
    // Send custom webapp <-> extension registration event in case webapp listener is attached first.
    document.dispatchEvent(new CustomEvent<{}>('sourcegraph:browser-extension-registration'))
}

/**
 * Attempts to connect to the Sourcegraph page and only resolves when the page
 * pings back. This always resolves to true.
 */
function connectToPage(): Promise<boolean> {
    return new Promise(resolve => {
        const ping = () => {
            window.postMessage({ source: 'Client' as Source, type: 'Ping' as MessageType }, '*')
        }

        let isConnected = false
        window.addEventListener('message', event => {
            if (event.source === window && event.data && (event.data.source as Source) === 'Page') {
                if (!isConnected) {
                    isConnected = true
                    ping()
                }
                resolve(true)
            }
        })
        ping()
    })
}

/**
 * Applies edits to settings whenever an Edit message is received from the page
 * script and sends back a SettingsUpdate message afterwards.
 */
function listenForSettingsUpdates(): void {
    window.addEventListener('message', event => {
        if (
            event.source === window &&
            event.data &&
            (event.data.source as Source) === 'Page' &&
            (event.data.type as MessageType) === 'Edit'
        ) {
            updateExtensionSettings('Client', event.data.edit).subscribe(() => {
                storage.getSync(storageItems => {
                    window.postMessage(
                        {
                            source: 'Client' as Source,
                            type: 'SettingsUpdate' as MessageType,
                            contents: storageItems.clientSettings,
                        },
                        '*'
                    )
                })
            })
        }
    })
}
