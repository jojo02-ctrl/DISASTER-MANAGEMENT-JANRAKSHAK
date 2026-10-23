"""Downloads the official CrisisMMD v2.0 data-split files (text + labels, ~3MB). Images (2.1GB) are optional: --with-images"""
import _bootstrap, os, sys, urllib.request, zipfile
from dintel.core import ROOT
url = "https://crisisnlp.qcri.org/data/crisismmd/crisismmd_datasplit_all.zip"
dst = os.path.join(ROOT, "data", "raw"); os.makedirs(dst, exist_ok=True)
zp = os.path.join(dst, "crisismmd_datasplit_all.zip")
if not os.path.exists(zp):
    print("downloading", url); urllib.request.urlretrieve(url, zp)
zipfile.ZipFile(zp).extractall(dst); print("extracted to", dst)
if "--with-images" in sys.argv:
    print("Image tarball: https://crisisnlp.qcri.org/data/crisismmd/CrisisMMD_v2.0.tar.gz (2.1GB) -> extract into data/raw/CrisisMMD_v2.0/")
