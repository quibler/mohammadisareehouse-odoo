# -*- coding: utf-8 -*-

from odoo import api, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    @api.model
    def _load_pos_data_fields(self, config_id):
        """
        Extend the POS data fields to include 'mobile' field
        so that both phone and mobile can be displayed on receipts
        """
        fields = super()._load_pos_data_fields(config_id)

        # Add 'mobile' field if it's not already present
        if 'mobile' not in fields:
            fields.append('mobile')

        return fields