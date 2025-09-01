# -*- coding: utf-8 -*-
from odoo import api, models


class ResCompany(models.Model):
    _inherit = 'res.company'

    @api.model
    def _load_pos_data_fields(self, config_id):
        """Add company address fields to POS data for receipt display"""
        fields = super()._load_pos_data_fields(config_id)
        fields.extend([
            'street',
            'street2',
            'city',
            'zip',
            'state_id',
            'country_id'
        ])
        return fields