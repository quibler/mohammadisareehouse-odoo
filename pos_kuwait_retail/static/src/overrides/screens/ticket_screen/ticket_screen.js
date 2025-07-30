/** @odoo-module **/

import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

patch(TicketScreen.prototype, {
    setup() {
        super.setup();

        onMounted(() => {
            this.waitForDropdownAndSetPaid();
        });
    },

    waitForDropdownAndSetPaid() {
        console.log('Setting up filter dropdown watcher...');

        // First, wait for the dropdown to appear
        this.waitForElement('.filter.btn.dropdown-toggle').then((dropdown) => {
            console.log('Filter dropdown found, setting up click handler...');
            this.setupDropdownClickHandler(dropdown);
        });
    },

    waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations) => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Timeout fallback
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    },

    setupDropdownClickHandler(dropdown) {
        // Check current state
        const currentSpan = dropdown.querySelector('span');
        const currentFilter = currentSpan ? currentSpan.textContent.trim() : '';

        if (currentFilter === 'Paid') {
            console.log('Filter already set to Paid');
            return;
        }

        console.log('Current filter:', currentFilter, '- need to change to Paid');

        // Click the dropdown to open it
        dropdown.click();

        // Wait for dropdown items to appear
        this.waitForDropdownItems().then((items) => {
            console.log('Dropdown items appeared, looking for Paid option...');
            this.selectPaidOption(items);
        }).catch((error) => {
            console.error('Failed to find dropdown items:', error);
        });
    },

    waitForDropdownItems(timeout = 5000) {
        return new Promise((resolve, reject) => {
            // Check if items already exist
            const existingItems = document.querySelectorAll('li.dropdown-item');
            if (existingItems.length > 0) {
                resolve(existingItems);
                return;
            }

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        const items = document.querySelectorAll('li.dropdown-item');
                        if (items.length > 0) {
                            observer.disconnect();
                            resolve(items);
                        }
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Timeout fallback
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Dropdown items not found within ${timeout}ms`));
            }, timeout);
        });
    },

    selectPaidOption(items) {
        for (const item of items) {
            const text = item.textContent.trim();
            console.log('Found dropdown item:', text);

            if (text === 'Paid') {
                console.log('Clicking Paid option...');
                item.click();

                // Wait for the change to take effect and verify
                setTimeout(() => {
                    const dropdown = document.querySelector('.filter.btn.dropdown-toggle');
                    const span = dropdown?.querySelector('span');
                    const newFilter = span ? span.textContent.trim() : '';
                    console.log('Filter successfully changed to:', newFilter);
                }, 100);

                return;
            }
        }

        console.log('Paid option not found in dropdown items');
    },

    async addAdditionalRefundInfo(order, destinationOrder) {
        console.log('addAdditionalRefundInfo called');
        console.log('Original order:', order);
        console.log('Original order sales_person_id:', order.sales_person_id);
        console.log('Destination order before:', destinationOrder);
        console.log('Destination order sales person before:', destinationOrder.getSalesPerson());

        // Call the parent method first
        await super.addAdditionalRefundInfo(order, destinationOrder);

        // Inherit sales person from original order to refund order
        if (order.sales_person_id && !destinationOrder.getSalesPerson()) {
            console.log('Setting sales person on refund order:', order.sales_person_id);
            destinationOrder.setSalesPerson(order.sales_person_id);
            console.log('Sales person set successfully');
        } else {
            console.log('Not setting sales person:', {
                originalHasSalesPerson: !!order.sales_person_id,
                destinationAlreadyHasSalesPerson: !!destinationOrder.getSalesPerson()
            });
        }

        console.log('Destination order after:', destinationOrder);
        console.log('Destination order sales person after:', destinationOrder.getSalesPerson());
    },
});