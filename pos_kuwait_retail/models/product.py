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


