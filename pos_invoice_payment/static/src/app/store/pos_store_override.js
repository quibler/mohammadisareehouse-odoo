import { PosStore } from "@point_of_sale/app/store/pos_store";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    async onClickBackButton() {
        // Check if current order is an invoice payment order
        const currentOrder = this.get_order();

        // Handle back button from PaymentScreen for invoice payments
        if (
            this.mainScreen.component === PaymentScreen &&
            currentOrder?.isInvoicePaymentOrder
        ) {
            // For invoice payment orders, go back to InvoiceScreen instead of ProductScreen
            this.mobile_pane = "left";

            // Save reference to original order before removing current one
            const originalOrder = currentOrder.originalOrder;

            // Delete the temporary invoice payment order to prevent it from interfering
            this.removeOrder(currentOrder);

            // Restore the original order if it still exists
            if (originalOrder && this.get_open_orders().includes(originalOrder)) {
                this.set_order(originalOrder);
            } else {
                // Original order doesn't exist anymore, ensure we have a regular order
                const openOrders = this.get_open_orders();
                if (openOrders.length === 0) {
                    this.add_new_order();
                } else {
                    const regularOrder = openOrders.find(o => !o.isInvoicePaymentOrder);
                    if (regularOrder) {
                        this.set_order(regularOrder);
                    } else {
                        this.add_new_order();
                    }
                }
            }

            // Navigate to InvoiceScreen
            this.showScreen("InvoiceScreen");
            return;
        }

        // Note: InvoicePaymentReceiptScreen handles its own back button via orderDone()
        // so we don't need to intercept it here

        // Call parent method for normal flow
        return super.onClickBackButton(...arguments);
    },
});
