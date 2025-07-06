# File: custom_addons/pos_kuwait_retail/models/res_partner.py
# -*- coding: utf-8 -*-

from odoo import api, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    @api.model
    def _load_pos_data_domain(self, data):
        """
        Override to load only customers (customer_rank > 0) in POS
        This ensures only partners marked as customers appear in POS customer selection
        """
        domain = super()._load_pos_data_domain(data)
        # Add filter to only load customers
        domain.append(("customer_rank", ">", 0))
        return domain

    @api.model
    def _load_pos_data_fields(self, config_id):
        """
        Override to include customer_rank field in POS data
        This is needed for frontend filtering
        """
        fields = super()._load_pos_data_fields(config_id)
        # Add customer_rank field if not already present
        if 'customer_rank' not in fields:
            fields.append('customer_rank')
        return fields