# -*- coding: utf-8 -*-

from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    def _load_pos_data_fields(self, config_id):
        """
        Override to include street2 field in POS partner data loading.

        The default POS partner loading doesn't include street2, which causes
        the field to be empty in POS even when the partner has street2 data.
        """
        fields = super()._load_pos_data_fields(config_id)

        # Add street2 to the fields list if not already present
        if 'street2' not in fields:
            fields.append('street2')

        return fields