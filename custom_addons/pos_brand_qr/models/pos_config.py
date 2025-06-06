# -*- coding: utf-8 -*-
from odoo import models, fields, api


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

        # Convert binary image to base64 data URL if present
        qr_image_url = False
        if self.brand_qr_image:
            qr_image_url = f"data:image/png;base64,{self.brand_qr_image.decode('utf-8')}"

        config_data.update({
            'brand_qr_enabled': self.brand_qr_enabled or False,
            'brand_qr_image': qr_image_url,
            'brand_qr_label': self.brand_qr_label or 'Visit our website',
        })
        return config_data