# -*- coding: utf-8 -*-

import logging
import re
import time
from odoo import models, fields, api, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # Kuwait retail defaults
    available_in_pos = fields.Boolean(default=True)
    type = fields.Selection(selection_add=[], default='consu')
    list_price = fields.Float(default=0.0)

    @api.model
    def default_get(self, fields_list):
        """Set Kuwait retail defaults"""
        defaults = super().default_get(fields_list)
        defaults.update({
            'available_in_pos': True,
            'type': 'consu',
            'list_price': 0.0
        })
        return defaults

    @api.model_create_multi
    def create(self, vals_list):
        """Auto-generate barcodes when creating product templates"""
        templates = super().create(vals_list)

        for template in templates:
            if len(template.product_variant_ids) == 1:
                variant = template.product_variant_ids[0]
                if not variant.barcode and template.name:
                    generated_barcode = variant._generate_barcode(template.name)
                    variant.barcode = generated_barcode
                    _logger.info(f"Generated barcode '{generated_barcode}' for '{template.name}'")

        return templates