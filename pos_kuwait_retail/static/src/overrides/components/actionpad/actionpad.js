/** @odoo-module */

import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { patch } from "@web/core/utils/patch";
import { onMounted } from "@odoo/owl";

/**
 * Debug version to investigate why qty button isn't working
 */

patch(ActionpadWidget.prototype, {

    setup() {
        super.setup();

        onMounted(() => {
            this._debugNumpadButtons();
        });
    },

    /**
     * Override changeMode to debug what happens when buttons are clicked
     */
    changeMode(mode) {
        console.log(`🎯 changeMode called with mode: "${mode}"`);
        console.log(`   Current numpadMode before: "${this.pos?.numpadMode}"`);
        console.log(`   User has price rights: ${this.pos?.cashierHasPriceControlRights?.()}`);

        try {
            // Call the original method
            const result = super.changeMode(mode);

            console.log(`   Current numpadMode after: "${this.pos?.numpadMode}"`);
            console.log(`   changeMode completed successfully`);

            return result;
        } catch (error) {
            console.error(`❌ Error in changeMode:`, error);
            throw error;
        }
    },

    /**
     * Debug numpad buttons to see what's available
     */
    _debugNumpadButtons() {
        setTimeout(() => {
            console.log("🔍 === DEBUGGING NUMPAD BUTTONS ===");

            // Check if this ActionpadWidget has buttons
            if (this.el) {
                console.log("📦 ActionpadWidget element:", this.el);

                const buttons = this.el.querySelectorAll('button');
                console.log(`   Found ${buttons.length} buttons in ActionpadWidget`);

                buttons.forEach((btn, index) => {
                    const text = btn.textContent.trim();
                    const dataMode = btn.getAttribute('data-mode');

                    console.log(`   Button ${index}: "${text}" [data-mode="${dataMode}"]`);

                    if (dataMode) {
                        console.log(`      🎯 MODE BUTTON: "${text}" -> mode: "${dataMode}"`);

                        // Add click listener to debug
                        btn.addEventListener('click', (e) => {
                            console.log(`🖱️ Button clicked: "${text}" [${dataMode}]`);
                            console.log(`   Event:`, e);
                            console.log(`   Button element:`, btn);
                        });
                    }
                });
            }

            // Also check globally for qty/price buttons
            console.log("🔍 === GLOBAL SEARCH FOR QTY/PRICE BUTTONS ===");

            const qtyButtons = document.querySelectorAll('button[data-mode="quantity"]');
            const priceButtons = document.querySelectorAll('button[data-mode="price"]');

            // Also find buttons by text content
            const allButtons = document.querySelectorAll('button');
            const qtyButtonsByText = Array.from(allButtons).filter(btn =>
                btn.textContent.trim().toLowerCase().includes('qty')
            );
            const priceButtonsByText = Array.from(allButtons).filter(btn =>
                btn.textContent.trim().toLowerCase().includes('price')
            );

            console.log(`Found ${qtyButtons.length} qty buttons by data-mode`);
            console.log(`Found ${qtyButtonsByText.length} qty buttons by text`);
            console.log(`Found ${priceButtons.length} price buttons by data-mode`);
            console.log(`Found ${priceButtonsByText.length} price buttons by text`);

            qtyButtons.forEach((btn, index) => {
                console.log(`🔢 Qty Button ${index} (by data-mode):`, btn);
                console.log(`   Text: "${btn.textContent.trim()}"`);
                console.log(`   Data-mode: "${btn.getAttribute('data-mode')}"`);
                console.log(`   Classes: ${btn.className}`);
                console.log(`   Disabled: ${btn.disabled}`);
                console.log(`   Style display: ${btn.style.display}`);

                // Test if button is clickable
                btn.addEventListener('click', () => {
                    console.log(`🖱️ QTY BUTTON CLICKED (data-mode): ${index}`);
                });
            });

            qtyButtonsByText.forEach((btn, index) => {
                console.log(`🔢 Qty Button ${index} (by text):`, btn);
                console.log(`   Text: "${btn.textContent.trim()}"`);
                console.log(`   Data-mode: "${btn.getAttribute('data-mode')}"`);
                console.log(`   Classes: ${btn.className}`);
                console.log(`   Disabled: ${btn.disabled}`);

                btn.addEventListener('click', () => {
                    console.log(`🖱️ QTY BUTTON CLICKED (text): ${index}`);
                });
            });

            priceButtons.forEach((btn, index) => {
                console.log(`💰 Price Button ${index} (by data-mode):`, btn);
                console.log(`   Text: "${btn.textContent.trim()}"`);
                console.log(`   Data-mode: "${btn.getAttribute('data-mode')}"`);
                console.log(`   Classes: ${btn.className}`);
                console.log(`   Disabled: ${btn.disabled}`);

                btn.addEventListener('click', () => {
                    console.log(`🖱️ PRICE BUTTON CLICKED (data-mode): ${index}`);
                });
            });

            priceButtonsByText.forEach((btn, index) => {
                console.log(`💰 Price Button ${index} (by text):`, btn);
                console.log(`   Text: "${btn.textContent.trim()}"`);
                console.log(`   Data-mode: "${btn.getAttribute('data-mode')}"`);
                console.log(`   Classes: ${btn.className}`);
                console.log(`   Disabled: ${btn.disabled}`);

                btn.addEventListener('click', () => {
                    console.log(`🖱️ PRICE BUTTON CLICKED (text): ${index}`);
                });
            });

            // Check POS state
            console.log("🔍 === POS STATE DEBUG ===");
            console.log("Current numpadMode:", this.pos?.numpadMode);
            console.log("Has price rights:", this.pos?.cashierHasPriceControlRights?.());
            console.log("Current order:", this.pos?.get_order?.());
            console.log("POS config:", this.pos?.config);

            // Check if there are any overrides blocking button functionality
            console.log("🔍 === CHECKING FOR CONFLICTS ===");
            console.log("ActionpadWidget prototype:", ActionpadWidget.prototype);
            console.log("changeMode method:", this.changeMode);

        }, 1000);
    }
});