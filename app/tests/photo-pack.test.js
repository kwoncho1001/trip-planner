export async function run(ctx) {
  const errors = [];

  // 5. GET the spots of "city:광저우" from ctx.data. SET the photos of the first spot to ["packs/test.jpg#1"] in memory.
  const spots = ctx?.data?.spotsOfCity ? ctx.data.spotsOfCity('city:광저우') : [];
  if (!spots || spots.length === 0) {
    errors.push('spots of "city:광저우" not found');
  } else {
    spots[0].photos = ['packs/test.jpg#1'];
  }

  // 6. CALL ctx.util.photoStyle("packs/test.jpg#1", 3). MAKE SURE the result has backgroundImage with packs/test.jpg and backgroundPosition "0% 50%".
  if (typeof ctx?.util?.photoStyle !== 'function') {
    errors.push('ctx.util.photoStyle is not a function');
  } else {
    const packStyle = ctx.util.photoStyle('packs/test.jpg#1', 3);
    if (!packStyle || typeof packStyle !== 'object') {
      errors.push('photoStyle did not return an object');
    } else {
      if (!packStyle.backgroundImage || !packStyle.backgroundImage.includes('packs/test.jpg')) {
        errors.push(`backgroundImage does not include "packs/test.jpg": got ${packStyle.backgroundImage}`);
      }
      if (packStyle.backgroundPosition !== '0% 50%') {
        errors.push(`backgroundPosition !== "0% 50%": got ${packStyle.backgroundPosition}`);
      }
    }

    // 7. MAKE SURE ctx.util.photoStyle("photos/a/1.jpg") returns { src: "photos/a/1.jpg" }.
    const plainStyle = ctx.util.photoStyle('photos/a/1.jpg');
    if (!plainStyle || plainStyle.src !== 'photos/a/1.jpg') {
      errors.push(`photoStyle("photos/a/1.jpg") !== { src: "photos/a/1.jpg" }: got ${JSON.stringify(plainStyle)}`);
    }
  }

  const pass = errors.length === 0;
  const detail = pass ? 'photo-pack passed' : `errors: ${errors.join('; ')}`;
  return { pass, detail };
}
