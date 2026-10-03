from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("orders", "0040_order_created_by")]

    operations = [
        migrations.AddField("order", "currency", models.CharField(max_length=3, default="EUR")),
    ]
