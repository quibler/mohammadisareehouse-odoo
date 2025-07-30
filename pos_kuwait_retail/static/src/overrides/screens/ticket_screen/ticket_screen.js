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

        console.log('Added AMOUNT search field with unique format');
        return fields;
    },

    // Completely override search when Amount field is selected
    getFilteredOrderList() {
        console.log('getFilteredOrderList called');

        // Try multiple ways to access search information
        const searchInfo = this.searchDetails || this.state?.search || this.search || {};
        const searchBarConfig = this.getSearchBarConfig ? this.getSearchBarConfig() : {};

        console.log('Search info:', searchInfo);

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

        console.log(`Final search: text="${searchText}", field="${fieldName}"`);

        // Check if we're searching by amount
        if (fieldName === 'AMOUNT' && searchText && searchText.trim()) {
            const searchAmount = parseFloat(searchText.trim());
            console.log(`🎯 AMOUNT SEARCH DETECTED: "${searchText}" -> ${searchAmount}`);

            // If search text is not a valid number, return empty array
            if (isNaN(searchAmount)) {
                console.log('❌ Invalid amount search - not a number:', searchText);
                return [];
            }

            // Get the base filtered orders (respects state filter like PAID)
            const baseOrders = this.getBaseFilteredOrders();
            console.log(`📋 Base orders after state filter: ${baseOrders.length}`);

            // Apply exact amount filtering
            const matchingOrders = baseOrders.filter(order => {
                const orderAmount = order.amount_total || order.get_total_with_tax?.() || 0;
                const matches = Math.abs(orderAmount - searchAmount) < 0.01;

                if (matches) {
                    console.log(`✅ Order ${order.name}: amount=${orderAmount} MATCHES search=${searchAmount}`);
                } else {
                    console.log(`❌ Order ${order.name}: amount=${orderAmount} does NOT match search=${searchAmount}`);
                }
                return matches;
            });

            console.log(`🎉 EXACT AMOUNT MATCH: Found ${matchingOrders.length} orders with amount exactly ${searchAmount}`);
            return matchingOrders;
        }

        // For non-amount searches, use the parent method
        console.log('Using parent getFilteredOrderList for non-amount search');
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
            console.error('Error getting base filtered orders:', error);
            // Fallback: try to get all orders from various possible sources
            return this.pos?.orders || this.syncedOrders || this.orders || [];
        }
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