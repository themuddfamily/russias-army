//Shockwave OBJECT/EMBED
function put_shockwave(swID, swWidth, swHeight, swFile, sw1, sw9)
{
    var str = '<OBJECT classid="clsid:233C1507-6A77-46A4-9443-F871F945D258"';
	str += 'codebase="http://download.macromedia.com/pub/shockwave/cabs/director/sw.cab#version=11,0,0,0"';
	str += ' id='+swID+' width='+swWidth+' height='+swHeight+'>\n';
	str += '<param name=src value="'+swFile+'">\n';
	str += '<param name=logo value=true>\n';
    str += '<param name=progress value=true>\n';
	str += '<param name=swStretchStyle value=fill>\n';
    str += '<param name=bgColor VALUE=#000000>\n';
	str += '<param name=sw1 value="'+sw1+'">\n';
	str += '<param name=sw9 value="'+sw9+'">\n';
	str += '<param name=swRemote value="';
	str += "swSaveEnabled='false' swVolume='false' swRestart='false' swPausePlay='false' swFastForward='false' swContextMenu='false' ";
	str += '">\n';
	str += '<param name=PlayerVersion value=11>';
	str += '<embed src="'+swFile+'"';
	str += ' bgColor=#000000 logo=true progress=true width='+swWidth+' height='+swHeight+' swStretchStyle=fill ';
	str += ' sw1="'+sw1+'"  ';
	str += ' sw9="'+sw9+'"  ';
	str += ' swRemote="';
	str += "swSaveEnabled='false' swVolume='false' swRestart='false' swPausePlay='false' swFastForward='false' swContextMenu='false' ";
	str += '"';
	str += ' type="application/x-director" PlayerVersion=11 PLUGINSPAGE="http://www.macromedia.com/shockwave/download/"\n';
	str += '</embed></object>';
	document.write(str);
}

function put_unity(unID, unWidth, unHeight, unFile, sw1, sw9)
{
	str='<object id="UnityObject" classid="clsid:444785F1-DE89-4295-863A-D46C3A781394"';
	str+='codebase="http://webplayer.unity3d.com/download_webplayer-2.x/UnityWebPlayer.cab#version=2,0,0,0"';
	str+='id='+unID+' width='+ unWidth +' height='+ unHeight+'>\n';
	str+='<param name="src" value=applets/'+unFile+'>\n';
	str+='<param name="backgroundcolor" value="000000" />'
	str+='<param name="textcolor" value="FF9900" />';
	str+='<param name="logoimage" value="http://www.gamevial.com/images/gamevialloader.png" />';
	str+='<embed id='+unID+' src=applets/'+unFile+' width='+unWidth+' height='+unHeight+'   backgroundcolor="000000"  logoimage="http://www.gamevial.com/images/gamevialloader.png" textcolor="FF9900" type="application/vnd.unity" pluginspage="http://www.unity3d.com/unity-web-player-2.x"></embed>\n';
	str+='<noembed><div align="center">';
	str+='This content requires the Unity Web Player<br /><br />';
	str+='<a href="http://www.unity3d.com/unity-web-player-2.x">Install the Unity Web Player today!</a>';
	str+='</div></noembed>';
	str+='</object>';
	document.write(str);
}

function put_flash(swfID, swfWidth, swfHeight, swfFile, swf1, swf9)
{
	var str = ' <object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" ';
	str += 'codebase="http://download.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=6,0,29,0" ';
	str += 'id='+swfID+' width='+swfWidth+' height='+swfHeight+'>\n';
    str += ' <param name="movie" value="applets/'+swfFile+'">\n';
    str += ' <param name="quality" value="high">\n';
    str += ' <embed src="applets/'+swfFile+'" quality="high" ';
	str += 'pluginspage="http://www.macromedia.com/go/getflashplayer" type="application/x-shockwave-flash" ';
	str += 'id='+swfID+' width='+swfWidth+' height='+swfHeight+'>\n';
	str += '</embed> </object>';
	document.write(str);
}