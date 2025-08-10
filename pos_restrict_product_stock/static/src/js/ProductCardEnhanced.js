/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { ProductCard } from "@point_of_sale/app/generic_components/product_card/product_card";
import { useState, useEffect } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";

patch(ProductCard.prototype, {
    setup() {
        super.setup();
        this.pos = usePos();
        this.stockData = useState({
            qty_available: this.props.product.qty_available || 0,
            virtual_available: this.props.product.virtual_available || 0,
        });

        // Use useEffect to watch for order changes
        useEffect(() => {
            this.refreshStock();
        }, () => [this.pos.get_order()?.lines?.length]);
    },

    async refreshStock() {
        if (!this.props.product.is_storable) return;

        try {
            const result = await this.pos.getProductInfo(this.props.product, 1);
            if (result?.productInfo?.warehouses?.[0]) {
                const warehouse = result.productInfo.warehouses[0];
                this.stockData.qty_available = warehouse.available_quantity;
                this.stockData.virtual_available = warehouse.forecasted_quantity;
            }
        } catch (error) {
            // Fallback to cached values if fetch fails
            console.warn("Stock refresh failed, using cached values");
        }
    },

    getRealTimeQty() {
        return this.stockData.qty_available;
    },

    getRealTimeVirtualQty() {
        return this.stockData.virtual_available;
    }
});