/** @odoo-module **/

import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

patch(TicketScreen.prototype, {
    setup() {
        super.setup();

        onMounted(() => {
            this.waitForDropdownAndSetPaid();
        });
    },

    // Override _getSearchFields to add Amount search field
    _getSearchFields() {
        const fields = super._getSearchFields();

        // Add AMOUNT search field - use a completely unique format that can't partially match
        fields.AMOUNT = {
            repr: (order) => {
                // Get the exact amount
                const amount = order.amount_total || order.get_total_with_tax?.() || 0;
                // Use a format that absolutely cannot partially match
                // Format: "AMT_EXACTLY_20.00_END" so "9" can never match "AMT_EXACTLY_19.00_END"
                return `AMT_EXACTLY_${amount.toFixed(2)}_END`;
            },
            displayName: _t('Amount'),
            modelField: 'amount_total',
        };

        return fields;
    },

    // Completely override search when Amount field is selected
    getFilteredOrderList() {

        // Try multiple ways to access search information
        const searchInfo = this.searchDetails || this.state?.search || this.search || {};
        const searchBarConfig = this.getSearchBarConfig ? this.getSearchBarConfig() : {};

        // Try to find search text and field from various sources - FIXED: use searchTerm instead of searchText
        let searchText = '';
        let fieldName = '';

        // Check different possible locations for search data
        if (searchInfo.searchTerm !== undefined) {
            searchText = searchInfo.searchTerm;
            fieldName = searchInfo.fieldName;
        } else if (searchInfo.searchText !== undefined) {
            searchText = searchInfo.searchText;
            fieldName = searchInfo.fieldName;
        } else if (this.state && this.state.search) {
            searchText = this.state.search.searchTerm || this.state.search.searchText || '';
            fieldName = this.state.search.fieldName || '';
        } else if (searchBarConfig.searchTerm) {
            searchText = searchBarConfig.searchTerm;
            fieldName = searchBarConfig.fieldName;
        }


        // Check if we're searching by amount
        if (fieldName === 'AMOUNT' && searchText && searchText.trim()) {
            const searchAmount = parseFloat(searchText.trim());

            // If search text is not a valid number, return empty array
            if (isNaN(searchAmount)) {
                return [];
            }

            // Get the base filtered orders (respects state filter like PAID)
            const baseOrders = this.getBaseFilteredOrders();

            // Apply exact amount filtering
            const matchingOrders = baseOrders.filter(order => {
                const orderAmount = order.amount_total || order.get_total_with_tax?.() || 0;
                const matches = Math.abs(orderAmount - searchAmount) < 0.01;

                return matches;
            });

            return matchingOrders;
        }

        // For non-amount searches, use the parent method
        return super.getFilteredOrderList ? super.getFilteredOrderList() : this.getBaseFilteredOrders();
    },

    // Get orders filtered by state (PAID/ONGOING etc) but not by search text
    getBaseFilteredOrders() {
        // This should get orders filtered by the current state filter (PAID, etc)
        // but not by search text
        try {
            // Try to get orders using the parent's state filtering only
            const originalSearchInfo = { ...this.searchDetails };
            this.searchDetails = { searchTerm: '', fieldName: '' };
            const orders = super.getFilteredOrderList ? super.getFilteredOrderList() : [];
            this.searchDetails = originalSearchInfo;
            return orders;
        } catch (error) {
            // Fallback: try to get all orders from various possible sources
            return this.pos?.orders || this.syncedOrders || this.orders || [];
        }
    },

    waitForDropdownAndSetPaid() {

        // First, wait for the dropdown to appear
        this.waitForElement('.filter.btn.dropdown-toggle').then((dropdown) => {
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
                reject(new Error(`Element not found within timeout`));
            }, timeout);
        });
    },

    setupDropdownClickHandler(dropdown) {
        // Check current state
        const currentSpan = dropdown.querySelector('span');
        const currentFilter = currentSpan ? currentSpan.textContent.trim() : '';

        if (currentFilter === 'Paid') {
            return;
        }

        // Click the dropdown to open it
        dropdown.click();

        // Wait for dropdown items to appear
        this.waitForDropdownItems().then((items) => {
            this.selectPaidOption(items);
        }).catch((error) => {
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
                reject(new Error(`Dropdown items not found within timeout`));
            }, timeout);
        });
    },

    selectPaidOption(items) {
        for (const item of items) {
            const text = item.textContent.trim();

            if (text === 'Paid') {
                item.click();
                return;
            }
        }

    },

    async addAdditionalRefundInfo(order, destinationOrder) {

        // Call the parent method first
        await super.addAdditionalRefundInfo(order, destinationOrder);

        // Inherit sales person from original order to refund order
        if (order.sales_person_id && !destinationOrder.getSalesPerson()) {
            destinationOrder.setSalesPerson(order.sales_person_id);
        }

    },
});