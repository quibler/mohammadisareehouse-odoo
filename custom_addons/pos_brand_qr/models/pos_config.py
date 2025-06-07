# -*- coding: utf-8 -*-
from odoo import models, fields


class PosConfig(models.Model):
    _inherit = 'pos.config'

    brand_qr_enabled = fields.Boolean(
        string="Enable Brand QR Code",
        default=False,
        help="Show QR code linking to brand pages on receipts"
    )

    brand_qr_image = fields.Binary(
        string="QR Code Image",
        help="Upload your QR code image (PNG, JPG, etc.)"
    )

    brand_qr_label = fields.Char(
        string="QR Code Label",
        default="Visit our website",
        help="Text to display below the QR code"
    )

    def _get_pos_ui_pos_config(self, params):
        """Add brand QR settings to the POS config data sent to the frontend"""
        config_data = super()._get_pos_ui_pos_config(params)

        # Use Odoo's web controller to serve the image
        qr_image_url = False
        if self.brand_qr_enabled and self.brand_qr_image:
            base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url')
            qr_image_url = f"{base_url}/web/image/pos.config/{self.id}/brand_qr_image"

        config_data.update({
            'brand_qr_enabled': self.brand_qr_enabled or False,
            'brand_qr_image': qr_image_url,
            'brand_qr_label': self.brand_qr_label or 'Visit our website',
        })
        return config_data


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_brand_qr_enabled = fields.Boolean(
        related='pos_config_id.brand_qr_enabled',
        readonly=False,
        string="Enable Brand QR Code"
    )
    pos_brand_qr_image = fields.Binary(
        related='pos_config_id.brand_qr_image',
        readonly=False,
        string="QR Code Image"
    )
    pos_brand_qr_label = fields.Char(
        related='pos_config_id.brand_qr_label',
        readonly=False,
        string="QR Code Label"
    )