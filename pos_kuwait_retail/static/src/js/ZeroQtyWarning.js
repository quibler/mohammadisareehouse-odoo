/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

// Method 1: Non-blocking notification using standard Odoo notification service
patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.notification = useService("notification");
    },

    async addProductToOrder(...args) {
        const product = args[0];

        // First, add the product to order (non-blocking)
        await super.addProductToOrder(...args);

        // Then show warning notification only for storable products with zero quantity
        if (product.is_storable && (product.qty_available <= 0 || product.virtual_available <= 0)) {
            this.notification.add(
                _t("%s has 0 quantity available in stock!", product.display_name),
                {
                    title: _t("Stock Warning"),
                    type: "warning",
                    sticky: false
                }
            );
        }
    },
});