/** @odoo-module **/
// File: custom_addons/pos_kuwait_retail/static/src/overrides/screens/partner_list/partner_list.js

import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";
import { patch } from "@web/core/utils/patch";

patch(PartnerList.prototype, {
    /**
     * Override method to ensure only customers (customer_rank > 0) are shown
     * when searching partners in POS
     * @override
     */
    async getNewPartners() {
        let domain = [];
        const limit = 30;

        if (this.state.query) {
            const search_fields = [
                "name",
                "parent_name",
                ...this.getPhoneSearchTerms(),
                "email",
                "barcode",
                "street",
                "zip",
                "city",
                "state_id",
                "country_id",
                "vat",
            ];
            domain = [
                "&",
                ...Array(search_fields.length - 1).fill("|"),
                ...search_fields.map((field) => [
                    field,
                    "ilike",
                    this.state.query + "%",
                ]),
                // Only load customers (customer_rank > 0)
                ["customer_rank", ">", 0],
            ];
        } else {
            // When no search query, still filter by customer_rank > 0
            domain = [["customer_rank", ">", 0]];
        }

        const result = await this.pos.data.searchRead("res.partner", domain, [], {
            limit: limit,
            offset: this.state.currentOffset,
        });

        return result;
    },

    /**
     * Safety filter for loaded partners to show only customers (customer_rank > 0)
     * This acts as a secondary filter for partners already loaded in memory
     * Since backend should already filter, this is mainly for safety
     * @override
     */
    getPartners() {
        const availablePartners = super.getPartners();
        // Filter to only show customers - safety check since backend should already filter
        const customerPartners = availablePartners.filter(
            (partner) => !partner.customer_rank || partner.customer_rank > 0
        );
        return customerPartners;
    },
});