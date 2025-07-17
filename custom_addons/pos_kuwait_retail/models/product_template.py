# -*- coding: utf-8 -*-

from odoo import models, fields, api


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # Set default values for new products
    available_in_pos = fields.Boolean(
        string='Available in POS',
        default=True,  # Default to True for retail clothing store
        help="Check if you want this product to appear in the Point of Sale."
    )

    type = fields.Selection(
        selection_add=[],
        default='consu',  # Default to 'consu' (Goods) for retail products
        help="A storable product is a product for which you manage stock. "
             "The Inventory app has to be installed."
    )

    list_price = fields.Float(
        string='Sales Price',
        default=0.0,  # Default sale price to 0
        digits='Product Price',
        help="Price at which the product is sold to customers."
    )

    @api.model
    def create(self, vals):
        """Override create to ensure default values are applied"""
        # Set default values if not provided
        if 'available_in_pos' not in vals:
            vals['available_in_pos'] = True

        if 'type' not in vals:
            vals['type'] = 'consu'  # Goods type for retail products

        if 'list_price' not in vals:
            vals['list_price'] = 0.0

        return super(ProductTemplate, self).create(vals)

    @api.model
    def default_get(self, fields_list):
        """Override default_get to set default values"""
        defaults = super(ProductTemplate, self).default_get(fields_list)

        # Set default values for retail clothing store
        if 'available_in_pos' in fields_list:
            defaults['available_in_pos'] = True

        if 'type' in fields_list:
            defaults['type'] = 'consu'  # Goods type for retail products

        if 'list_price' in fields_list:
            defaults['list_price'] = 0.0

        return defaults


class ProductProduct(models.Model):
    _inherit = 'product.product'

    # Set default for inventory tracking
    is_storable = fields.Boolean(
        string='Track Inventory',
        default=True,  # Default to True for inventory tracking
        help="Check if you want to track inventory for this product."
    )

    @api.model
    def create(self, vals):
        """Override create to ensure is_storable is True by default for consu products"""
        # Set default is_storable for consu products
        if vals.get('type') == 'consu' and 'is_storable' not in vals:
            vals['is_storable'] = True

        return super(ProductProduct, self).create(vals)

    @api.model
    def default_get(self, fields_list):
        """Override default_get to set is_storable default"""
        defaults = super(ProductProduct, self).default_get(fields_list)

        # Set is_storable to True by default for consu products
        if 'is_storable' in fields_list and defaults.get('type') == 'consu':
            defaults['is_storable'] = True

        return defaults