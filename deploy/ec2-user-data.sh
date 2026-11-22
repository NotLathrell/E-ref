#!/bin/bash
# EC2 launch-template user data (Amazon Linux 2023). Installs Docker, clones the repo, starts E-REF.
set -euxo pipefail

dnf install -y docker git
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
usermod -aG docker ec2-user

# 2 GB swap so the image build (pip + PyTorch) does not run out of memory on a t3.small.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

sudo -u ec2-user git clone https://github.com/NotLathrell/E-ref.git /home/ec2-user/E-ref
sudo -u ec2-user -i bash /home/ec2-user/E-ref/deploy/deploy.sh
